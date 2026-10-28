import { SyntheticEvent, useEffect } from 'react';

import {
  DataSourcePluginOptionsEditorProps,
  onUpdateDatasourceJsonDataOption,
  updateDatasourcePluginJsonDataOption,
} from '@grafana/data';
import { ConfigSection, ConfigSubSection, DataSourceDescription, EditorStack } from '@grafana/plugin-ui';
import { Alert, Field, Icon, Input, Label, RadioButtonGroup, Switch, Tooltip } from '@grafana/ui';

import { Divider, TLSSecretsConfig } from '../sql';
import { MySQLOptions, TokenSource } from '../types';

const DEFAULT_MAX_CONNS_PER_USER = 5;
const DEFAULT_CONN_MAX_IDLE_SECONDS = 60;

const tokenSourceOptions: Array<{ label: string; value: TokenSource; description: string }> = [
  { label: 'ID token', value: 'id_token', description: 'Always a JWT. Audience is the Grafana IDAM client ID.' },
  {
    label: 'Access token',
    value: 'access_token',
    description: 'Must be a JWT: the Grafana IDAM client needs the jwt access token strategy.',
  },
];

export const ConfigurationEditor = (props: DataSourcePluginOptionsEditorProps<MySQLOptions>) => {
  const { options, onOptionsChange } = props;
  const jsonData = options.jsonData;

  // Grafana only forwards the user's tokens to the backend when jsonData.oauthPassThru is true.
  // This plugin cannot work without it, so it is always on and not shown as a choice.
  useEffect(() => {
    if (jsonData.oauthPassThru !== true) {
      updateDatasourcePluginJsonDataOption(props, 'oauthPassThru', true);
    }
  }, [jsonData.oauthPassThru]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDSOptionChanged = (property: keyof MySQLOptions) => {
    return (event: SyntheticEvent<HTMLInputElement>) => {
      onOptionsChange({ ...options, ...{ [property]: event.currentTarget.value } });
    };
  };

  const onSwitchChanged = (property: keyof MySQLOptions) => {
    return (event: SyntheticEvent<HTMLInputElement>) => {
      updateDatasourcePluginJsonDataOption(props, property, event.currentTarget.checked);
    };
  };

  // The backend reads these as integers, so store numbers rather than strings
  const onNumberChanged = (property: 'maxConnsPerUser' | 'connMaxIdleSeconds' | 'connMaxLifetime') => {
    return (event: SyntheticEvent<HTMLInputElement>) => {
      const value = parseInt(event.currentTarget.value, 10);
      updateDatasourcePluginJsonDataOption(props, property, Number.isNaN(value) ? undefined : value);
    };
  };

  const WIDTH_LONG = 40;

  return (
    <>
      <DataSourceDescription
        dataSourceName="StarRocks (IDAM identity)"
        docsLink="https://grafana.com/docs/grafana/latest/datasources/mysql/"
        hasRequiredFields={true}
      />

      <Alert severity="info" title="Queries run as the signed-in user">
        This datasource has no shared database user. Every query connects to StarRocks as the Grafana user who runs it,
        using their IDAM token as the password, and StarRocks/Ranger decide what that user may read. Users must sign in
        to Grafana through IDAM. Alert rules, service accounts, public dashboards and basic-auth users have no IDAM
        token and cannot query this datasource. Use <strong>Save &amp; test</strong> while signed in through IDAM to see
        which StarRocks user you map to.
      </Alert>

      <Divider />

      <ConfigSection title="Connection">
        <Field label="Host URL" description="StarRocks FE MySQL port, host:port." required>
          <Input
            width={WIDTH_LONG}
            name="host"
            type="text"
            value={options.url || ''}
            placeholder="starrocks.example.internal:9030"
            onChange={onDSOptionChanged('url')}
          />
        </Field>

        <Field label="Database name">
          <Input
            width={WIDTH_LONG}
            name="database"
            value={jsonData.database || ''}
            placeholder="Database"
            onChange={onUpdateDatasourceJsonDataOption(props, 'database')}
          />
        </Field>
      </ConfigSection>

      <Divider />

      <ConfigSection title="IDAM identity">
        <Field
          label="Token sent to StarRocks"
          description={tokenSourceOptions.find((o) => o.value === (jsonData.tokenSource || 'id_token'))?.description}
        >
          <RadioButtonGroup<TokenSource>
            options={tokenSourceOptions}
            value={jsonData.tokenSource || 'id_token'}
            onChange={(v) => updateDatasourcePluginJsonDataOption(props, 'tokenSource', v)}
          />
        </Field>

        <Field
          label="Username claim"
          description="Token claim sent as the StarRocks username. Must match the principal field of the StarRocks JWT security integration and the user names in Ranger."
        >
          <Input
            width={WIDTH_LONG}
            name="usernameClaim"
            value={jsonData.usernameClaim || ''}
            placeholder="sub"
            onChange={onUpdateDatasourceJsonDataOption(props, 'usernameClaim')}
          />
        </Field>
      </ConfigSection>

      <Divider />

      <ConfigSection
        title="TLS"
        description="The token is sent as a cleartext password, so the connection always uses TLS. Add the CA that signed the StarRocks certificate."
      >
        <Field label="With CA Cert" description="Verify the StarRocks certificate against the CA certificate below.">
          <Switch onChange={onSwitchChanged('tlsAuthWithCACert')} value={jsonData.tlsAuthWithCACert || false} />
        </Field>

        <Field label="Use TLS Client Auth" description="Present a client certificate, configured below, to StarRocks.">
          <Switch onChange={onSwitchChanged('tlsAuth')} value={jsonData.tlsAuth || false} />
        </Field>

        <Field
          label="Skip TLS Verification"
          description="Do not verify the StarRocks certificate. Anyone who can intercept the connection can then read user tokens. Do not use outside local testing."
        >
          <Switch onChange={onSwitchChanged('tlsSkipVerify')} value={jsonData.tlsSkipVerify || false} />
        </Field>

        {jsonData.tlsAuth || jsonData.tlsAuthWithCACert ? (
          <>
            <Field
              label="Server name"
              description="Name in the StarRocks certificate, if it differs from the host in Host URL."
            >
              <Input
                width={WIDTH_LONG}
                name="serverName"
                value={jsonData.serverName || ''}
                placeholder="starrocks.example.internal"
                onChange={onUpdateDatasourceJsonDataOption(props, 'serverName')}
              />
            </Field>
            <TLSSecretsConfig
              showCACert={jsonData.tlsAuthWithCACert}
              showKeyPair={jsonData.tlsAuth}
              editorProps={props}
              labelWidth={WIDTH_LONG}
            />
          </>
        ) : null}
      </ConfigSection>

      <Divider />

      <ConfigSection title="Additional settings" isCollapsible>
        <ConfigSubSection title="Query options">
          <Field
            label={
              <Label>
                <EditorStack gap={0.5}>
                  <span>Session timezone</span>
                  <Tooltip
                    content={
                      <span>
                        Specify the timezone used in the database session, such as <code>Asia/Kolkata</code> or
                        <code>+05:30</code>. Set with <code>SET time_zone=&apos;...&apos;</code> on each connection.
                        Leave empty to keep the server default.
                      </span>
                    }
                  >
                    <Icon name="info-circle" size="sm" />
                  </Tooltip>
                </EditorStack>
              </Label>
            }
          >
            <Input
              width={WIDTH_LONG}
              value={jsonData.timezone || ''}
              onChange={onUpdateDatasourceJsonDataOption(props, 'timezone')}
              placeholder="Asia/Kolkata or +05:30"
            />
          </Field>

          <Field
            label="Min time interval"
            description="A lower limit for the auto group by time interval. Recommended to be set to write frequency, for example 1m if your data is written every minute."
          >
            <Input
              width={WIDTH_LONG}
              placeholder="1m"
              value={jsonData.timeInterval || ''}
              onChange={onUpdateDatasourceJsonDataOption(props, 'timeInterval')}
            />
          </Field>
        </ConfigSubSection>

        <ConfigSubSection
          title="Connection limits"
          description="Each user gets their own small pool of connections, because a MySQL connection is authenticated as one user."
        >
          <Field
            label="Max connections per user"
            description={`Concurrent queries one user can run on this datasource. Default ${DEFAULT_MAX_CONNS_PER_USER}.`}
          >
            <Input
              type="number"
              min={1}
              width={WIDTH_LONG}
              placeholder={String(DEFAULT_MAX_CONNS_PER_USER)}
              value={jsonData.maxConnsPerUser ?? ''}
              onChange={onNumberChanged('maxConnsPerUser')}
            />
          </Field>

          <Field
            label="Idle connection timeout (seconds)"
            description={`Close a user's connection after it has been idle this long. Keep below the load balancer idle timeout. Default ${DEFAULT_CONN_MAX_IDLE_SECONDS}.`}
          >
            <Input
              type="number"
              min={1}
              width={WIDTH_LONG}
              placeholder={String(DEFAULT_CONN_MAX_IDLE_SECONDS)}
              value={jsonData.connMaxIdleSeconds ?? ''}
              onChange={onNumberChanged('connMaxIdleSeconds')}
            />
          </Field>

          <Field
            label="Max connection lifetime (seconds)"
            description="Reconnect after this long. Connections never outlive the token that opened them."
          >
            <Input
              type="number"
              min={0}
              width={WIDTH_LONG}
              placeholder="14400"
              value={jsonData.connMaxLifetime ?? ''}
              onChange={onNumberChanged('connMaxLifetime')}
            />
          </Field>
        </ConfigSubSection>

        <ConfigSubSection title="Local development">
          <Field
            label="Allow plaintext connection"
            description="Connect without TLS. The IDAM token is then sent unencrypted. Only for a local StarRocks container."
          >
            <Switch onChange={onSwitchChanged('allowPlaintext')} value={jsonData.allowPlaintext || false} />
          </Field>
        </ConfigSubSection>
      </ConfigSection>
    </>
  );
};
