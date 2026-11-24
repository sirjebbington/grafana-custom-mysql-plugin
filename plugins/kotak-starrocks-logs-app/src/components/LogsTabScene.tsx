import { css } from '@emotion/css';
import { useMemo, useState } from 'react';

import { DataFrame, GrafanaTheme2, LoadingState, dateTimeFormat, urlUtil } from '@grafana/data';
import { config as grafanaConfig } from '@grafana/runtime';
import {
  SceneComponentProps,
  SceneObject,
  SceneObjectBase,
  SceneObjectState,
  SceneQueryRunner,
  VizPanel,
  sceneGraph,
} from '@grafana/scenes';
import {
  Alert,
  Button,
  ClipboardButton,
  Icon,
  InlineSwitch,
  JSONFormatter,
  LinkButton,
  RadioButtonGroup,
  Select,
  Spinner,
  useStyles2,
} from '@grafana/ui';

import { getAppConfig } from '../config/config';
import { appQueryHint } from '../datasource/api';
import { buildSql, searchProgressOf } from '../datasource/StarRocksLogsDataSource';
import { withQueryHint } from '../sql/builder';
import { extractMessageFields } from '../patterns/messageFields';
import { QuerySpec } from '../state/types';
import { Display, getExploration } from './api';
import { barsPanel, logsPanel, queryRunner, tablePanel } from './panels';
import { ErrorBox, Loading } from './ui';

export interface LogsTabState extends SceneObjectState {
  spec: QuerySpec;
  withLevel: boolean;
  /**
   * text search over more than maxScanHours: the volume chart (which has to read every line in the range) is
   * loaded on request; the lines are searched newest first and stop at the line limit
   */
  volumeDeferred?: boolean;
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
  /** query of the lines (owned by the panel); its progress is shown above the lines */
  private linesRunner?: SceneQueryRunner;

  constructor(state: LogsTabState) {
    super(state);
    this.addActivationHandler(() => {
      if (!this.state.main) {
        this.build();
      }
    });
  }

  private build() {
    const { spec, withLevel, display, sort, limit, wrap, volumeDeferred } = this.state;
    const api = getExploration(this);
    const volume = volumeDeferred ? undefined : barsPanel('Log volume', queryRunner('volume', spec, { withLevel }));
    let main: SceneObject;
    const lines = queryRunner(display === 'table' ? 'table' : 'logs', spec, { limit, sort });
    if (display === 'table') {
      main = tablePanel(lines);
    } else if (display === 'json') {
      main = new JsonLogsScene({ $data: lines });
    } else {
      main = logsPanel(api, lines, {
        sort,
        wrap,
        // the line limit is the page size: scrolling to the end loads the next page
        title: 'Logs',
      });
    }
    this.linesRunner = lines;
    this.setState({ volume, main });
  }

  getLinesRunner(): SceneQueryRunner | undefined {
    return this.linesRunner;
  }

  exploreUrl(): string | undefined {
    const api = getExploration(this);
    const ctx = api.getContext();
    if (!ctx) {
      return undefined;
    }
    const tr = sceneGraph.getTimeRange(this).state;
    // with the app's hint (session zone of this view, query timeout); Explore shows __ms as the line time
    const sql = withQueryHint(
      buildSql(
        {
          refId: 'A',
          kind: 'table',
          spec: this.state.spec,
          params: { limit: this.state.limit, sort: this.state.sort },
        },
        ctx,
        tr.value
      ),
      appQueryHint({ datasource: this.state.spec.datasource, view: this.state.spec.view })
    );
    const config = getAppConfig();
    // the data source selected in the app (each one is a different StarRocks database)
    const datasource = { type: config.datasource.type, uid: this.state.spec.datasource || config.datasource.uid };
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

function formatSpan(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m} min`;
  }
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Progress of a windowed text search (newest first), with a Stop button while it runs. */
function SearchStatus({ runner, sort }: { runner: SceneQueryRunner; sort: 'desc' | 'asc' }) {
  const styles = useStyles2(getStyles);
  const { data } = runner.useState();
  const p = searchProgressOf(data?.series[0]);
  if (!p || !data) {
    return null;
  }
  const running = data.state === LoadingState.Loading || data.state === LoadingState.Streaming;
  const total = formatSpan(p.rangeToMs - p.rangeFromMs);
  const searched = formatSpan(p.searchedToMs - p.searchedFromMs);
  const order = sort === 'desc' ? 'newest' : 'oldest';
  if (running) {
    return (
      <div className={styles.status} data-testid="search-status">
        <Spinner inline />
        <span>
          Searching the log text, {order} first: {searched} of {total} searched, {p.lines} lines found.
        </span>
        <Button size="sm" fill="text" icon="square-shape" onClick={() => runner.cancelQuery()}>
          Stop
        </Button>
      </div>
    );
  }
  if (!p.done) {
    return (
      <div className={styles.status} data-testid="search-status">
        Search stopped: {searched} of {total} searched, {p.lines} lines found.
      </div>
    );
  }
  if (p.lines >= p.limit && p.searchedToMs - p.searchedFromMs < p.rangeToMs - p.rangeFromMs) {
    return (
      <div className={styles.status} data-testid="search-status">
        The {order} {p.lines} matching lines were found in the {order === 'newest' ? 'last' : 'first'} {searched} of the{' '}
        {total}; scroll to the end of the list to load more.
      </div>
    );
  }
  return null;
}

/** Placeholder for the volume chart of a long text search, loaded on request. */
function DeferredVolume({ model }: { model: LogsTabScene }) {
  const styles = useStyles2(getStyles);
  const api = getExploration(model);
  const range = sceneGraph.getTimeRange(model).useState().value;
  const hours = Math.round(((range.to.valueOf() - range.from.valueOf()) / 3_600_000) * 10) / 10;
  return (
    <div className={styles.deferred} data-testid="volume-deferred">
      <Icon name="chart-line" />
      <span>
        The log volume of a text search over {hours} hours reads every line in the range (more than{' '}
        {getAppConfig().maxScanHours} hours), so it loads on request. The lines below are searched newest first.
      </span>
      <Button size="sm" variant="secondary" onClick={() => api.allowLongScan()}>
        Load volume
      </Button>
    </div>
  );
}

function LogsTabRenderer({ model }: SceneComponentProps<LogsTabScene>) {
  const styles = useStyles2(getStyles);
  const { volume, main, display, sort, limit, wrap, withLevel, volumeDeferred } = model.useState();
  const api = getExploration(model);
  const ctx = api.getContext();
  const levelSkipped = !volumeDeferred && !withLevel && ctx?.tenant.level.source === 'message';
  const runner = main ? model.getLinesRunner() : undefined;

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
      {volumeDeferred ? (
        <DeferredVolume model={model} />
      ) : (
        <div className={styles.volume}>{volume && <volume.Component model={volume} />}</div>
      )}
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
      {runner && <SearchStatus runner={runner} sort={sort} />}
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
  deferred: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 2),
    border: `1px dashed ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    color: theme.colors.text.secondary,
  }),
  status: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  toolbar: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap' }),
  spacer: css({ flex: 1 }),
  main: css({ height: 'calc(100vh - 320px)', minHeight: 480, minWidth: 0 }),
  json: css({ height: '100%', overflow: 'auto' }),
  jsonRow: css({ borderBottom: `1px solid ${theme.colors.border.weak}`, padding: theme.spacing(0.5, 0) }),
});
