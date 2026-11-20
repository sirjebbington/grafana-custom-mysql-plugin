import { css } from '@emotion/css';
import { useState } from 'react';

import { AppPluginMeta, GrafanaTheme2, PluginConfigPageProps, rangeUtil } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { Alert, Button, Field, TextArea, useStyles2 } from '@grafana/ui';

import { PLUGIN_ID } from '../constants';
import { AppJsonData, resolveConfig, setAppConfig } from '../config/config';
import { fetchViews, listDatasources } from '../datasource/api';

const EXAMPLE: AppJsonData = {
  datasourceUid: 'app-logs-starrocks-db',
  datasources: ['app-logs-starrocks-db', { uid: 'app-logs-starrocks-db2', viewPrefix: 'vw_eks_app_logs_' }],
  viewPrefix: 'vw_eks_app_logs_',
  maxScanHours: 6,
  tenants: {
    default: { level: { source: 'column' } },
    app_1961_observability: {
      level: { source: 'message' },
      trace: { regex: 'traceid=([0-9a-f]{32})', tempoUid: 'app1961_ds_tempo_obs_public' },
      patterns: [{ name: 'Connection timeout', like: '%timed out%' }],
    },
  },
};

/**
 * Configuration page (Administration > Plugins > Logs Drilldown (StarRocks)). Shows the effective
 * configuration and its validation errors. Settings are normally provisioned from deploy-config
 * (provisioning/plugins); saving here changes them until the next provisioning run.
 */
export function AppConfig({ plugin }: PluginConfigPageProps<AppPluginMeta<AppJsonData>>) {
  const styles = useStyles2(getStyles);
  const [text, setText] = useState(JSON.stringify(plugin.meta.jsonData ?? {}, null, 2));
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [views, setViews] = useState<string>();

  let parsed: AppJsonData | undefined;
  let parseError: string | undefined;
  try {
    parsed = JSON.parse(text) as AppJsonData;
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }
  const { config, errors } = resolveConfig(parsed);

  const save = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      await getBackendSrv().post(`/api/plugins/${PLUGIN_ID}/settings`, {
        enabled: true,
        pinned: true,
        jsonData: parsed,
      });
      window.location.reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : JSON.stringify(e));
      setSaving(false);
    }
  };

  const testViews = async () => {
    setAppConfig(parsed);
    const range = rangeUtil.convertRawToRange({ from: 'now-15m', to: 'now' });
    const lines = await Promise.all(
      listDatasources().map(async (ds) => {
        try {
          const list = await fetchViews(range, ds.uid);
          return `${ds.name}: ${list.length > 0 ? list.join(', ') : '(none)'}`;
        } catch (e) {
          return `${ds.name}: error: ${e instanceof Error ? e.message : String(e)}`;
        }
      })
    );
    setViews(lines.length > 0 ? lines.join('\n') : `(no ${config.datasource.type} data source visible)`);
  };

  return (
    <div className={styles.wrapper} data-testid="app-config">
      <p>
        The app sends SQL through the StarRocks data source chosen in its picker (default{' '}
        <code>{config.datasource.uid}</code>; one data source per database) as the signed-in user. Settings are usually
        provisioned from deploy-config; edits saved here are replaced by the next provisioning run.
      </p>
      {(parseError || errors.length > 0) && (
        <Alert severity="warning" title="Configuration problems (invalid entries are ignored)">
          <ul>
            {parseError && <li>JSON: {parseError}</li>}
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      <Field
        label="jsonData"
        description="Keys: datasourceUid, datasources, viewPrefix, serviceLabel, defaultTimeRange, maxScanHours, lineLimit, labels, fields, tenants (app_id or <datasourceUid>/<app_id>)"
      >
        <TextArea rows={24} value={text} onChange={(e) => setText(e.currentTarget.value)} className={styles.mono} />
      </Field>
      <div className={styles.buttons}>
        <Button onClick={save} disabled={!!parseError || saving}>
          Save
        </Button>
        <Button variant="secondary" onClick={() => setText(JSON.stringify(EXAMPLE, null, 2))}>
          Load example
        </Button>
        <Button variant="secondary" onClick={testViews} disabled={!!parseError}>
          Test: list my views
        </Button>
      </div>
      {views && (
        <Alert severity="info" title="Views visible to you, per data source">
          <pre className={styles.mono} data-testid="config-views">
            {views}
          </pre>
        </Alert>
      )}
      {saveError && (
        <Alert severity="error" title="Save failed">
          {saveError}
        </Alert>
      )}
      <h4>Effective configuration</h4>
      <pre className={styles.mono}>{JSON.stringify(config, null, 2)}</pre>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(2), maxWidth: 1000 }),
  mono: css({ fontFamily: theme.typography.fontFamilyMonospace, fontSize: theme.typography.bodySmall.fontSize }),
  buttons: css({ display: 'flex', gap: theme.spacing(1) }),
});
