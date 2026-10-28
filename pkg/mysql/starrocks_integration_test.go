package mysql

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/stretchr/testify/require"

	"github.com/kotak/kotak-starrocks-datasource/pkg/mysql/sqleng"
)

// TestIntegrationStarRocksJWT runs the plugin's QueryData and CheckHealth against a real StarRocks that has a
// JWT security integration, exactly as Grafana calls them with oauthPassThru enabled. It is skipped unless
// STARROCKS_IT_ADDR is set. Set up the server with scripts/local-starrocks.sh (see docs/AGENT_GUIDE.md):
//
//	STARROCKS_IT_ADDR=127.0.0.1:19030 STARROCKS_IT_KEY=$PWD/dev/jwt/key.pem go test ./pkg/mysql -run TestIntegrationStarRocksJWT -v
func TestIntegrationStarRocksJWT(t *testing.T) {
	addr := os.Getenv("STARROCKS_IT_ADDR")
	if addr == "" {
		t.Skip("STARROCKS_IT_ADDR not set")
	}
	keyPath := envOr("STARROCKS_IT_KEY", "../../dev/jwt/key.pem")
	issuer := envOr("STARROCKS_IT_ISSUER", "https://local-idam/")
	audience := envOr("STARROCKS_IT_AUDIENCE", "grafana-local")
	key := loadRSAKey(t, keyPath)

	ctx := backend.WithGrafanaConfig(context.Background(), backend.NewGrafanaCfg(map[string]string{
		backend.SQLRowLimit:                      "1000000",
		backend.SQLMaxOpenConnsDefault:           "10",
		backend.SQLMaxIdleConnsDefault:           "10",
		backend.SQLMaxConnLifetimeSecondsDefault: "14400",
		backend.UserFacingDefaultError:           "please inspect Grafana server log for details",
	}))

	newHandler := func(t *testing.T, jsonData map[string]any) *sqleng.DataSourceHandler {
		t.Helper()
		jsonData["allowPlaintext"] = true // the local container has no TLS
		raw, err := json.Marshal(jsonData)
		require.NoError(t, err)
		inst, err := NewInstanceSettings(log.DefaultLogger)(ctx, backend.DataSourceInstanceSettings{
			UID: "it", URL: addr, JSONData: raw, DecryptedSecureJSONData: map[string]string{},
		})
		require.NoError(t, err)
		h := inst.(*sqleng.DataSourceHandler)
		t.Cleanup(h.Dispose)
		return h
	}

	query := func(t *testing.T, h *sqleng.DataSourceHandler, headers map[string]string, rawSQL string) backend.DataResponse {
		t.Helper()
		resp, err := h.QueryData(ctx, &backend.QueryDataRequest{
			Headers: headers,
			Queries: []backend.DataQuery{{
				RefID:     "A",
				JSON:      []byte(fmt.Sprintf(`{"rawSql":%q,"format":"table"}`, rawSQL)),
				TimeRange: backend.TimeRange{From: time.Now().Add(-time.Hour), To: time.Now()},
			}},
		})
		require.NoError(t, err)
		return resp.Responses["A"]
	}

	firstValue := func(t *testing.T, r backend.DataResponse) string {
		t.Helper()
		require.NoError(t, r.Error)
		require.NotEmpty(t, r.Frames)
		v := r.Frames[0].Fields[0].At(0)
		if p, ok := v.(*string); ok {
			return *p
		}
		return fmt.Sprint(v)
	}

	idTokenHeaders := func(tok string) map[string]string {
		return map[string]string{backend.OAuthIdentityIDTokenHeaderName: tok}
	}

	t.Run("health check logs in as the token's user", func(t *testing.T) {
		h := newHandler(t, map[string]any{"oauthPassThru": true})
		tok := signJWT(t, key, issuer, audience, "kmbl3alice", time.Hour)
		res, err := h.CheckHealth(ctx, &backend.CheckHealthRequest{Headers: idTokenHeaders(tok)})
		require.NoError(t, err)
		require.Equal(t, backend.HealthStatusOk, res.Status, res.Message)
		require.Contains(t, res.Message, "kmbl3alice")
		t.Log(res.Message)
	})

	t.Run("query runs as the token's user", func(t *testing.T) {
		h := newHandler(t, map[string]any{"oauthPassThru": true})
		tok := signJWT(t, key, issuer, audience, "kmbl3alice", time.Hour)
		require.Contains(t, firstValue(t, query(t, h, idTokenHeaders(tok), "SELECT CURRENT_USER()")), "kmbl3alice")
	})

	t.Run("access token source", func(t *testing.T) {
		h := newHandler(t, map[string]any{"oauthPassThru": true, "tokenSource": "access_token"})
		tok := signJWT(t, key, issuer, audience, "kmbl3alice", time.Hour)
		headers := map[string]string{backend.OAuthIdentityTokenHeaderName: "Bearer " + tok}
		require.Contains(t, firstValue(t, query(t, h, headers, "SELECT CURRENT_USER()")), "kmbl3alice")
	})

	t.Run("user_name claim logs in with the upper-case id", func(t *testing.T) {
		h := newHandler(t, map[string]any{"oauthPassThru": true, "usernameClaim": "user_name"})
		tok := signJWT(t, key, issuer, audience, "kmbl3alice", time.Hour)
		require.Contains(t, firstValue(t, query(t, h, idTokenHeaders(tok), "SELECT CURRENT_USER()")), "KMBL3ALICE")
	})

	t.Run("concurrent users never share a connection", func(t *testing.T) {
		h := newHandler(t, map[string]any{"oauthPassThru": true, "maxConnsPerUser": 2})
		users := []string{"kmbl3u1", "kmbl3u2", "kmbl3u3", "kmbl3u4"}
		tokens := map[string]string{}
		for _, u := range users {
			tokens[u] = signJWT(t, key, issuer, audience, u, time.Hour)
		}
		var wg sync.WaitGroup
		for i := 0; i < 40; i++ {
			wg.Add(1)
			go func(u string) {
				defer wg.Done()
				got := firstValue(t, query(t, h, idTokenHeaders(tokens[u]), "SELECT CURRENT_USER()"))
				require.Contains(t, got, u)
			}(users[i%len(users)])
		}
		wg.Wait()
	})

	t.Run("refreshed token reconnects", func(t *testing.T) {
		h := newHandler(t, map[string]any{"oauthPassThru": true})
		first := signJWT(t, key, issuer, audience, "kmbl3bob", 10*time.Minute)
		require.Contains(t, firstValue(t, query(t, h, idTokenHeaders(first), "SELECT CURRENT_USER()")), "kmbl3bob")
		refreshed := signJWT(t, key, issuer, audience, "kmbl3bob", time.Hour)
		require.Contains(t, firstValue(t, query(t, h, idTokenHeaders(refreshed), "SELECT CURRENT_USER()")), "kmbl3bob")
	})

	t.Run("wrong audience is rejected by StarRocks with a visible error", func(t *testing.T) {
		h := newHandler(t, map[string]any{"oauthPassThru": true})
		tok := signJWT(t, key, issuer, "some-other-client", "kmbl3alice", time.Hour)
		r := query(t, h, idTokenHeaders(tok), "SELECT 1")
		require.Error(t, r.Error)
		t.Log(r.Error)
		require.Contains(t, strings.ToLower(r.Error.Error()), "access denied")
	})

	t.Run("token signed by another key is rejected", func(t *testing.T) {
		h := newHandler(t, map[string]any{"oauthPassThru": true})
		other, err := rsa.GenerateKey(rand.Reader, 2048)
		require.NoError(t, err)
		tok := signJWT(t, other, issuer, audience, "kmbl3alice", time.Hour)
		r := query(t, h, idTokenHeaders(tok), "SELECT 1")
		require.Error(t, r.Error)
		require.Contains(t, strings.ToLower(r.Error.Error()), "access denied")
	})

	t.Run("no token", func(t *testing.T) {
		h := newHandler(t, map[string]any{"oauthPassThru": true})
		r := query(t, h, map[string]string{}, "SELECT 1")
		require.ErrorContains(t, r.Error, "no IDAM token")
	})

	t.Run("oauthPassThru disabled", func(t *testing.T) {
		h := newHandler(t, map[string]any{})
		res, err := h.CheckHealth(ctx, &backend.CheckHealthRequest{Headers: map[string]string{}})
		require.NoError(t, err)
		require.Equal(t, backend.HealthStatusError, res.Status)
		require.Contains(t, res.Message, "oauthPassThru is disabled")
	})

	t.Run("expired token is not sent", func(t *testing.T) {
		h := newHandler(t, map[string]any{"oauthPassThru": true})
		tok := signJWT(t, key, issuer, audience, "kmbl3alice", -time.Minute)
		r := query(t, h, idTokenHeaders(tok), "SELECT 1")
		require.ErrorContains(t, r.Error, sqleng.ErrTokenExpired.Error())
	})

	t.Run("privilege errors are shown to the user", func(t *testing.T) {
		root := openRoot(t, addr)
		_, err := root.Exec("CREATE DATABASE IF NOT EXISTS it_db")
		require.NoError(t, err)
		_, err = root.Exec(`CREATE TABLE IF NOT EXISTS it_db.logs (ts DATETIME, msg VARCHAR(100)) DUPLICATE KEY(ts) DISTRIBUTED BY HASH(ts) BUCKETS 1 PROPERTIES ("replication_num" = "1")`)
		require.NoError(t, err)

		h := newHandler(t, map[string]any{"oauthPassThru": true})
		tok := signJWT(t, key, issuer, audience, "kmbl3alice", time.Hour)
		r := query(t, h, idTokenHeaders(tok), "SELECT * FROM it_db.logs")
		require.Error(t, r.Error)
		t.Log(r.Error)
		require.NotContains(t, r.Error.Error(), "please inspect Grafana server log", "privilege error must not be replaced by the generic error")
	})
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func loadRSAKey(t *testing.T, path string) *rsa.PrivateKey {
	t.Helper()
	data, err := os.ReadFile(path)
	require.NoError(t, err, "run: go run ./tools/devjwt keygen -dir dev/jwt")
	block, _ := pem.Decode(data)
	require.NotNil(t, block)
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	require.NoError(t, err)
	return key
}

// signJWT creates an RS256 token shaped like an IDAM ID token, with kid matching tools/devjwt's JWKS.
func signJWT(t *testing.T, key *rsa.PrivateKey, iss, aud, sub string, ttl time.Duration) string {
	t.Helper()
	now := time.Now()
	header, _ := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT", "kid": "devjwt-1"})
	claims, _ := json.Marshal(map[string]any{
		"iss": iss, "aud": []string{aud}, "sub": sub, "user_name": strings.ToUpper(sub),
		"iat": now.Unix(), "exp": now.Add(ttl).Unix(),
	})
	input := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(claims)
	digest := sha256.Sum256([]byte(input))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	require.NoError(t, err)
	return input + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func openRoot(t *testing.T, addr string) *sql.DB {
	t.Helper()
	cfg := mysql.NewConfig()
	cfg.Net = "tcp"
	cfg.Addr = addr
	cfg.User = envOr("STARROCKS_IT_ROOT_USER", "root")
	cfg.Passwd = os.Getenv("STARROCKS_IT_ROOT_PASSWORD")
	connector, err := mysql.NewConnector(cfg)
	require.NoError(t, err)
	db := sql.OpenDB(connector)
	t.Cleanup(func() { _ = db.Close() })
	return db
}
