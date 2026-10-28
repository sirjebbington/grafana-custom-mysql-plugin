package mysql

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/VividCortex/mysqlerr"
	"github.com/go-sql-driver/mysql"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	sdkhttpclient "github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/kotak/kotak-starrocks-datasource/pkg/mysql/sqleng"
)

const (
	dateFormat      = "2006-01-02"
	dateTimeFormat1 = "2006-01-02 15:04:05"
	dateTimeFormat2 = "2006-01-02T15:04:05Z"
)

// timezonePattern restricts the session time zone to values like "+05:30" or "Asia/Kolkata"; it is sent
// to StarRocks as part of a SET statement.
var timezonePattern = regexp.MustCompile(`^[A-Za-z0-9_/+:\-]+$`)

func NewInstanceSettings(logger log.Logger) datasource.InstanceFactoryFunc {
	return func(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
		cfg := backend.GrafanaConfigFromContext(ctx)
		sqlCfg, err := cfg.SQL()
		if err != nil {
			return nil, err
		}
		jsonData := sqleng.JsonData{
			ConnMaxLifetime: sqlCfg.DefaultMaxConnLifetimeSeconds,
		}

		err = json.Unmarshal(settings.JSONData, &jsonData)
		if err != nil {
			return nil, fmt.Errorf("error reading settings: %w", err)
		}

		database := jsonData.Database
		if database == "" {
			database = settings.Database
		}

		dsInfo := sqleng.DataSourceInfo{
			JsonData:                jsonData,
			URL:                     settings.URL,
			User:                    settings.User,
			Database:                database,
			ID:                      settings.ID,
			Updated:                 settings.Updated,
			UID:                     settings.UID,
			DecryptedSecureJSONData: settings.DecryptedSecureJSONData,
		}

		if dsInfo.URL == "" || strings.HasPrefix(dsInfo.URL, "/") {
			return nil, errors.New("host must be set to <host>:<port> of the StarRocks FE MySQL port (unix sockets are not supported)")
		}

		// The connection is built as a driver Config rather than a DSN string so the token, which becomes
		// the password, never appears in a string that could be logged.
		base := mysql.NewConfig()
		base.Net = "tcp"
		base.Addr = dsInfo.URL
		base.DBName = dsInfo.Database
		base.Collation = "utf8mb4_unicode_ci"
		base.ParseTime = true
		base.Loc = time.UTC
		base.Timeout = 10 * time.Second
		// The user's JWT is the password. StarRocks JWT security integrations switch the client to the
		// authentication_openid_connect_client plugin, which needs the patched driver in third_party/.
		// mysql_clear_password is also allowed in case StarRocks is configured to request it.
		base.AllowOpenIDConnect = true
		base.AllowCleartextPasswords = true
		base.AllowNativePasswords = true

		if dsInfo.JsonData.Timezone != "" {
			if !timezonePattern.MatchString(dsInfo.JsonData.Timezone) {
				return nil, fmt.Errorf("invalid session timezone %q", dsInfo.JsonData.Timezone)
			}
			base.Params = map[string]string{"time_zone": "'" + dsInfo.JsonData.Timezone + "'"}
		}

		opts, err := settings.HTTPClientOptions(ctx)
		if err != nil {
			return nil, err
		}

		tlsConfig, err := sdkhttpclient.GetTLSConfig(opts)
		if err != nil {
			return nil, err
		}

		// The token travels as a cleartext password, so TLS is always on. Without a CA certificate the
		// server certificate is verified against the system roots; the driver checks the host name from URL
		// unless serverName is set.
		if dsInfo.JsonData.AllowPlaintext {
			logger.Warn("allowPlaintext is enabled: IDAM tokens are sent to StarRocks without TLS", "datasource", settings.UID)
		} else {
			base.TLS = tlsConfig
		}

		config := sqleng.DataPluginConfiguration{
			DSInfo:            dsInfo,
			TimeColumnNames:   []string{"time", "time_sec"},
			MetricColumnTypes: []string{"CHAR", "VARCHAR", "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT"},
			RowLimit:          sqlCfg.RowLimit,
			Identity: sqleng.IdentityConfig{
				TokenSource:   dsInfo.JsonData.TokenSource,
				UsernameClaim: dsInfo.JsonData.UsernameClaim,
			},
		}

		if !dsInfo.JsonData.OAuthPassThru {
			logger.Warn("oauthPassThru is disabled: Grafana will not forward IDAM tokens and every query will fail", "datasource", settings.UID)
		}

		userFacingDefaultError, err := cfg.UserFacingDefaultError()
		if err != nil {
			return nil, err
		}

		rowTransformer := mysqlQueryResultTransformer{
			userError: userFacingDefaultError,
		}

		pools := sqleng.NewPoolManager(base, sqleng.PoolConfig{
			MaxConnsPerUser: dsInfo.JsonData.MaxConnsPerUser,
			ConnMaxIdleTime: time.Duration(dsInfo.JsonData.ConnMaxIdleSeconds) * time.Second,
			ConnMaxLifetime: time.Duration(dsInfo.JsonData.ConnMaxLifetime) * time.Second,
		}, logger)

		return sqleng.NewQueryDataHandler(userFacingDefaultError, pools, config, &rowTransformer, newMysqlMacroEngine(logger, userFacingDefaultError), logger)
	}
}

type mysqlQueryResultTransformer struct {
	userError string
}

// userVisibleErrors are MySQL error numbers whose server message is shown to the user. Authentication and
// authorization failures are included so users see that StarRocks or Ranger denied them, rather than a
// generic error.
var userVisibleErrors = map[uint16]bool{
	mysqlerr.ER_PARSE_ERROR:                  true,
	mysqlerr.ER_BAD_FIELD_ERROR:              true,
	mysqlerr.ER_NO_SUCH_TABLE:                true,
	mysqlerr.ER_DBACCESS_DENIED_ERROR:        true,
	mysqlerr.ER_ACCESS_DENIED_ERROR:          true,
	mysqlerr.ER_BAD_DB_ERROR:                 true,
	mysqlerr.ER_TABLEACCESS_DENIED_ERROR:     true,
	mysqlerr.ER_COLUMNACCESS_DENIED_ERROR:    true,
	mysqlerr.ER_SPECIFIC_ACCESS_DENIED_ERROR: true,
}

func (t *mysqlQueryResultTransformer) TransformQueryError(logger log.Logger, err error) error {
	var driverErr *mysql.MySQLError
	if errors.As(err, &driverErr) {
		// StarRocks reports some privilege errors with its own error numbers, so also match on the message
		if !userVisibleErrors[driverErr.Number] && !strings.Contains(strings.ToLower(driverErr.Message), "access denied") {
			logger.Error("Query error", "error", err)
			return fmt.Errorf(("query failed - %s"), t.userError)
		}
	}
	if errors.Is(err, mysql.ErrCleartextPassword) || errors.Is(err, mysql.ErrOpenIDConnect) {
		return fmt.Errorf("StarRocks requested an auth plugin the driver refused: %w", err)
	}

	return err
}

func (t *mysqlQueryResultTransformer) GetConverterList() []sqlutil.StringConverter {
	// For the MySQL driver , we have these possible data types:
	// https://www.w3schools.com/sql/sql_datatypes.asp#:~:text=In%20MySQL%20there%20are%20three,numeric%2C%20and%20date%20and%20time.
	// Since by default, we convert all into String, we need only to handle the Numeric data types
	return []sqlutil.StringConverter{
		{
			Name:           "handle DOUBLE",
			InputScanKind:  reflect.Struct,
			InputTypeName:  "DOUBLE",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableFloat64,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := strconv.ParseFloat(*in, 64)
					if err != nil {
						return nil, err
					}
					return &v, nil
				},
			},
		},
		{
			Name:           "handle BIGINT",
			InputScanKind:  reflect.Struct,
			InputTypeName:  "BIGINT",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableInt64,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := strconv.ParseInt(*in, 10, 64)
					if err != nil {
						return nil, err
					}
					return &v, nil
				},
			},
		},
		{
			Name:           "handle DECIMAL",
			InputScanKind:  reflect.Slice,
			InputTypeName:  "DECIMAL",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableFloat64,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := strconv.ParseFloat(*in, 64)
					if err != nil {
						return nil, err
					}
					return &v, nil
				},
			},
		},
		{
			Name:           "handle DATETIME",
			InputScanKind:  reflect.Struct,
			InputTypeName:  "DATETIME",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableTime,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := time.Parse(dateTimeFormat1, *in)
					if err == nil {
						return &v, nil
					}
					v, err = time.Parse(dateTimeFormat2, *in)
					if err == nil {
						return &v, nil
					}

					return nil, err
				},
			},
		},
		{
			Name:           "handle DATE",
			InputScanKind:  reflect.Struct,
			InputTypeName:  "DATE",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableTime,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := time.Parse(dateFormat, *in)
					if err == nil {
						return &v, nil
					}
					v, err = time.Parse(dateTimeFormat1, *in)
					if err == nil {
						return &v, nil
					}
					v, err = time.Parse(dateTimeFormat2, *in)
					if err == nil {
						return &v, nil
					}
					return nil, err
				},
			},
		},
		{
			Name:           "handle TIMESTAMP",
			InputScanKind:  reflect.Struct,
			InputTypeName:  "TIMESTAMP",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableTime,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := time.Parse(dateTimeFormat1, *in)
					if err == nil {
						return &v, nil
					}
					v, err = time.Parse(dateTimeFormat2, *in)
					if err == nil {
						return &v, nil
					}
					return nil, err
				},
			},
		},
		{
			Name:           "handle YEAR",
			InputScanKind:  reflect.Struct,
			InputTypeName:  "YEAR",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableInt64,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := strconv.ParseInt(*in, 10, 64)
					if err != nil {
						return nil, err
					}
					return &v, nil
				},
			},
		},
		{
			Name:           "handle TINYINT",
			InputScanKind:  reflect.Struct,
			InputTypeName:  "TINYINT",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableInt64,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := strconv.ParseInt(*in, 10, 64)
					if err != nil {
						return nil, err
					}
					return &v, nil
				},
			},
		},
		{
			Name:           "handle SMALLINT",
			InputScanKind:  reflect.Struct,
			InputTypeName:  "SMALLINT",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableInt64,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := strconv.ParseInt(*in, 10, 64)
					if err != nil {
						return nil, err
					}
					return &v, nil
				},
			},
		},
		{
			Name:           "handle INT",
			InputScanKind:  reflect.Struct,
			InputTypeName:  "INT",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableInt64,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := strconv.ParseInt(*in, 10, 64)
					if err != nil {
						return nil, err
					}
					return &v, nil
				},
			},
		},
		{
			Name:           "handle FLOAT",
			InputScanKind:  reflect.Struct,
			InputTypeName:  "FLOAT",
			ConversionFunc: func(in *string) (*string, error) { return in, nil },
			Replacer: &sqlutil.StringFieldReplacer{
				OutputFieldType: data.FieldTypeNullableFloat64,
				ReplaceFunc: func(in *string) (any, error) {
					if in == nil {
						return nil, nil
					}
					v, err := strconv.ParseFloat(*in, 64)
					if err != nil {
						return nil, err
					}
					return &v, nil
				},
			},
		},
	}
}
