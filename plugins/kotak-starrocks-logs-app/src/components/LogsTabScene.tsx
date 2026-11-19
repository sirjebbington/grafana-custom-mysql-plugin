import { css } from '@emotion/css';
import { useMemo, useState } from 'react';

import { DataFrame, GrafanaTheme2, LoadingState, dateTimeFormat, urlUtil } from '@grafana/data';
import { config as grafanaConfig } from '@grafana/runtime';
import {
  SceneComponentProps,
  SceneObject,
  SceneObjectBase,
  SceneObjectState,
  VizPanel,
  sceneGraph,
} from '@grafana/scenes';
import {
  Alert,
  Button,
  ClipboardButton,
  InlineSwitch,
  JSONFormatter,
  LinkButton,
  RadioButtonGroup,
  Select,
  useStyles2,
} from '@grafana/ui';

import { getAppConfig } from '../config/config';
import { buildSql } from '../datasource/StarRocksLogsDataSource';
import { extractMessageFields } from '../patterns/messageFields';
import { QuerySpec } from '../state/types';
import { Display, getExploration } from './api';
import { barsPanel, logsPanel, queryRunner, tablePanel } from './panels';
import { ErrorBox, Loading } from './ui';

export interface LogsTabState extends SceneObjectState {
  spec: QuerySpec;
  withLevel: boolean;
  display: Display;
  sort: 'desc' | 'asc';
  limit: number;
  wrap: boolean;
  volume?: VizPanel;
  main?: SceneObject;
}

/** Logs tab: volume histogram by level and the lines as Logs, Table or JSON. */
export class LogsTabScene extends SceneObjectBase<LogsTabState> {
  static Component = LogsTabRenderer;

  constructor(state: LogsTabState) {
    super(state);
    this.addActivationHandler(() => {
      if (!this.state.main) {
        this.build();
      }
    });
  }

  private build() {
    const { spec, withLevel, display, sort, limit, wrap } = this.state;
    const api = getExploration(this);
    const volume = barsPanel('Log volume', queryRunner('volume', spec, { withLevel }));
    let main: SceneObject;
    if (display === 'table') {
      main = tablePanel(queryRunner('table', spec, { limit, sort }));
    } else if (display === 'json') {
      main = new JsonLogsScene({ $data: queryRunner('logs', spec, { limit, sort }) });
    } else {
      main = logsPanel(api, queryRunner('logs', spec, { limit, sort }), {
        sort,
        wrap,
        title: `Logs (newest ${limit})`,
      });
    }
    this.setState({ volume, main });
  }

  exploreUrl(): string | undefined {
    const api = getExploration(this);
    const ctx = api.getContext();
    if (!ctx) {
      return undefined;
    }
    const tr = sceneGraph.getTimeRange(this).state;
    const sql = buildSql(
      { refId: 'A', kind: 'table', spec: this.state.spec, params: { limit: this.state.limit, sort: this.state.sort } },
      ctx,
      tr.value
    );
    const { datasource } = getAppConfig();
    const panes = {
      a: {
        datasource: datasource.uid,
        queries: [{ refId: 'A', datasource, rawSql: sql, format: 'table', rawQuery: true, editorMode: 'code' }],
        range: { from: tr.from, to: tr.to },
      },
    };
    return urlUtil.renderUrl(`${grafanaConfig.appSubUrl ?? ''}/explore`, {
      schemaVersion: 1,
      panes: JSON.stringify(panes),
    });
  }
}

const LIMITS = [100, 500, 1000, 2000, 5000].map((n) => ({ label: `${n} lines`, value: n }));
const DISPLAYS: Array<{ label: string; value: Display }> = [
  { label: 'Logs', value: 'logs' },
  { label: 'Table', value: 'table' },
  { label: 'JSON', value: 'json' },
];
const SORTS: Array<{ label: string; value: 'desc' | 'asc' }> = [
  { label: 'Newest first', value: 'desc' },
  { label: 'Oldest first', value: 'asc' },
];

function LogsTabRenderer({ model }: SceneComponentProps<LogsTabScene>) {
  const styles = useStyles2(getStyles);
  const { volume, main, display, sort, limit, wrap, withLevel } = model.useState();
  const api = getExploration(model);
  const ctx = api.getContext();
  const levelSkipped = !withLevel && ctx?.tenant.level.source === 'message';

  return (
    <div className={styles.wrapper}>
      {levelSkipped && (
        <Alert severity="info" title="Log volume is not split by level for this range">
          This tenant&apos;s level is read from the message text, which needs a full scan over more than{' '}
          {getAppConfig().maxScanHours} hours.{' '}
          <Button size="sm" variant="secondary" onClick={() => api.allowLongScan()}>
            Split by level anyway
          </Button>
        </Alert>
      )}
      <div className={styles.volume}>{volume && <volume.Component model={volume} />}</div>
      <div className={styles.toolbar}>
        <RadioButtonGroup size="sm" options={SORTS} value={sort} onChange={(v) => api.setDisplay({ sort: v })} />
        <Select
          width={16}
          options={LIMITS}
          value={limit}
          onChange={(o) => api.setDisplay({ limit: o.value! })}
          aria-label="Line limit"
        />
        <RadioButtonGroup
          size="sm"
          options={DISPLAYS}
          value={display}
          onChange={(v) => api.setDisplay({ display: v })}
        />
        {display === 'logs' && (
          <InlineSwitch label="Wrap lines" showLabel value={wrap} onChange={() => api.setDisplay({ wrap: !wrap })} />
        )}
        <div className={styles.spacer} />
        <LinkButton
          size="sm"
          variant="secondary"
          icon="compass"
          href={model.exploreUrl()}
          target="_blank"
          data-testid="open-in-explore"
        >
          Open in Explore
        </LinkButton>
        <ClipboardButton size="sm" variant="secondary" icon="share-alt" getText={() => window.location.href}>
          Copy link
        </ClipboardButton>
      </div>
      <div className={styles.main} data-testid="logs-main">
        {main && <main.Component model={main} />}
      </div>
    </div>
  );
}

interface JsonLogsState extends SceneObjectState {}

/** JSON view: every line as an object (timestamp, level, labels, parsed message fields). */
export class JsonLogsScene extends SceneObjectBase<JsonLogsState> {
  static Component = JsonLogsRenderer;
}

function rowsOf(frame?: DataFrame) {
  if (!frame) {
    return [];
  }
  const get = (name: string) => frame.fields.find((f) => f.name === name)?.values ?? [];
  const ts = get('timestamp');
  const body = get('body');
  const sev = get('severity');
  const labels = get('labels') as Array<Record<string, string>>;
  const trace = get('traceID');
  return body.map((b, i) => {
    const message = String(b);
    let parsed: unknown;
    try {
      parsed = message.trim().startsWith('{') ? JSON.parse(message) : undefined;
    } catch {
      parsed = undefined;
    }
    const fields = parsed === undefined ? extractMessageFields(message) : undefined;
    return {
      timestamp: dateTimeFormat(Number(ts[i]), { format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      level: sev[i],
      ...(trace[i] ? { traceID: trace[i] } : {}),
      labels: labels[i],
      message: parsed ?? message,
      ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
    };
  });
}

function JsonLogsRenderer({ model }: SceneComponentProps<JsonLogsScene>) {
  const styles = useStyles2(getStyles);
  const data = sceneGraph.getData(model).useState().data;
  const [shown, setShown] = useState(100);
  const rows = useMemo(() => rowsOf(data?.series[0]), [data]);
  if (!data || data.state === LoadingState.Loading) {
    return <Loading />;
  }
  if (data.state === LoadingState.Error) {
    return <ErrorBox title="Query failed" error={data.errors?.[0]?.message ?? 'error'} />;
  }
  return (
    <div className={styles.json} data-testid="json-view">
      {rows.slice(0, shown).map((r, i) => (
        <div key={i} className={styles.jsonRow}>
          <JSONFormatter json={r} open={1} />
        </div>
      ))}
      {rows.length > shown && (
        <Button size="sm" variant="secondary" onClick={() => setShown(shown + 100)}>
          Show more ({rows.length - shown} left)
        </Button>
      )}
      {rows.length === 0 && <div>No lines</div>}
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1), minWidth: 0 }),
  volume: css({ height: 200 }),
  toolbar: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap' }),
  spacer: css({ flex: 1 }),
  main: css({ height: 'calc(100vh - 320px)', minHeight: 480, minWidth: 0 }),
  json: css({ height: '100%', overflow: 'auto' }),
  jsonRow: css({ borderBottom: `1px solid ${theme.colors.border.weak}`, padding: theme.spacing(0.5, 0) }),
});
