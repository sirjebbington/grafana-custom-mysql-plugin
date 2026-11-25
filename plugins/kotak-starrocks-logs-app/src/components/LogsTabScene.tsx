import { css } from '@emotion/css';
import { useMemo, useRef, useState } from 'react';

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
import { getVolumeVisible, setVolumeVisible } from '../state/storage';
import { useFillHeight } from './layout';
import { barsPanel, logsPanel, queryRunner, tablePanel } from './panels';
import { ErrorBox, Loading } from './ui';

export interface LogsTabState extends SceneObjectState {
  spec: QuerySpec;
  withLevel: boolean;
  /** level split estimated from about 1 in n lines (message-level tenants over more than an hour) */
  sample?: number;
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
  /** the first lines are in: the volume chart may start */
  volumeReady?: boolean;
}

/** Logs tab: volume histogram by level and the lines as Logs, Table or JSON. */
export class LogsTabScene extends SceneObjectBase<LogsTabState> {
  static Component = LogsTabRenderer;
  /** query of the lines (owned by the panel); its progress is shown above the lines */
  private linesRunner?: SceneQueryRunner;
  /** query of the volume chart (owned by its panel), for the loading badge */
  private volumeRunner?: SceneQueryRunner;

  constructor(state: LogsTabState) {
    super(state);
    this.addActivationHandler(() => {
      if (!this.state.main) {
        this.build();
      }
      return this.startVolumeAfterLines();
    });
  }

  /**
   * The volume chart reads every line in the range; the list is a cheap top-N. The chart starts once the first
   * lines are in (or the list failed), so the two do not compete for the backend (UAT: one backend, DOP 3) and
   * the lines show first, as in the internal UI. Later refreshes run both together.
   */
  private startVolumeAfterLines(): (() => void) | undefined {
    const runner = this.linesRunner;
    if (this.state.volumeReady || !runner) {
      return undefined;
    }
    const arrived = () => {
      const data = runner.state.data;
      return data !== undefined && data.state !== LoadingState.Loading;
    };
    if (arrived()) {
      this.setState({ volumeReady: true });
      return undefined;
    }
    const sub = runner.subscribeToState(() => {
      if (arrived()) {
        sub.unsubscribe();
        this.setState({ volumeReady: true });
      }
    });
    return () => sub.unsubscribe();
  }

  private build() {
    const { spec, withLevel, sample, display, sort, limit, wrap, volumeDeferred } = this.state;
    const api = getExploration(this);
    const volumeRunner = volumeDeferred ? undefined : queryRunner('volume', spec, { withLevel, sample });
    const volume = volumeRunner
      ? barsPanel(sample ? `Log volume (≈ estimated from 1 in ${sample} lines)` : 'Log volume', volumeRunner, {
          description: sample
            ? 'This tenant has no level column: levels are read from the message text. Over this range the counts per level are estimated from a hash sample of the lines and multiplied back.'
            : undefined,
        })
      : undefined;
    this.volumeRunner = volumeRunner;
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

  getVolumeRunner(): SceneQueryRunner | undefined {
    return this.volumeRunner;
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

export function formatSpan(ms: number): string {
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

/** "Loading…" badge over a panel while its query runs (the panels alone show an empty box or old data). */
function LoadingBadge({ runner, text }: { runner?: SceneQueryRunner; text: string }) {
  if (!runner) {
    return null;
  }
  return <LoadingBadgeInner runner={runner} text={text} />;
}

function LoadingBadgeInner({ runner, text }: { runner: SceneQueryRunner; text: string }) {
  const styles = useStyles2(getStyles);
  const { data } = runner.useState();
  const loading = !data || data.state === LoadingState.Loading;
  if (!loading) {
    return null;
  }
  const empty = !data || data.series.every((f) => f.length === 0);
  return (
    <div className={empty ? styles.badgeCenter : styles.badgeCorner} data-testid="panel-loading">
      <Spinner inline /> {text}
    </div>
  );
}

function LogsTabRenderer({ model }: SceneComponentProps<LogsTabScene>) {
  const styles = useStyles2(getStyles);
  const { volume, main, display, sort, limit, wrap, volumeDeferred, volumeReady } = model.useState();
  const api = getExploration(model);
  const runner = main ? model.getLinesRunner() : undefined;
  const ref = useRef<HTMLDivElement>(null);
  // the tab fills the window below the header; the lines scroll inside their panel, not the page
  const height = useFillHeight(ref);
  const [showVolume, setShowVolume] = useState(() => getVolumeVisible());
  const toggleVolume = () => {
    setVolumeVisible(!showVolume);
    setShowVolume(!showVolume);
  };

  return (
    <div className={styles.wrapper} ref={ref} style={height ? { height } : undefined} data-testid="logs-tab">
      {volumeDeferred ? (
        <DeferredVolume model={model} />
      ) : (
        showVolume && (
          <div className={styles.volume} data-testid="volume-panel">
            {volume && volumeReady && <volume.Component model={volume} />}
            <LoadingBadge runner={model.getVolumeRunner()} text="Loading log volume…" />
          </div>
        )
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
        {!volumeDeferred && (
          <InlineSwitch
            label="Volume"
            showLabel
            value={showVolume}
            onChange={toggleVolume}
            data-testid="toggle-volume"
          />
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
        <LoadingBadge runner={runner} text="Loading lines…" />
      </div>
    </div>
  );
}

interface JsonLogsState extends SceneObjectState {}

/** JSON view: every line as an object (timestamp, level, labels, parsed message fields). */
export class JsonLogsScene extends SceneObjectBase<JsonLogsState> {
  static Component = JsonLogsRenderer;
}

/** Rows of the JSON view: a JSON message stays an object, a logfmt one gets its key=value fields. */
export function rowsOf(frame?: DataFrame) {
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
  wrapper: css({ display: 'flex', flexDirection: 'column', gap: theme.spacing(1), minWidth: 0, minHeight: 0 }),
  volume: css({ height: 150, flex: '0 0 auto', position: 'relative' }),
  deferred: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 2),
    border: `1px dashed ${theme.colors.border.medium}`,
    borderRadius: theme.shape.radius.default,
    color: theme.colors.text.secondary,
    flex: '0 0 auto',
  }),
  status: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    flex: '0 0 auto',
  }),
  toolbar: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1), flexWrap: 'wrap' }),
  spacer: css({ flex: 1 }),
  // fills what is left of the tab's height; the Logs panel scrolls inside it
  main: css({ flex: '1 1 auto', minHeight: 320, minWidth: 0, position: 'relative' }),
  badgeCenter: css({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(1),
    color: theme.colors.text.secondary,
    pointerEvents: 'none',
  }),
  badgeCorner: css({
    position: 'absolute',
    top: theme.spacing(0.5),
    right: theme.spacing(5),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.25, 1),
    borderRadius: theme.shape.radius.default,
    background: theme.colors.background.secondary,
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
    pointerEvents: 'none',
  }),
  json: css({ height: '100%', overflow: 'auto' }),
  jsonRow: css({ borderBottom: `1px solid ${theme.colors.border.weak}`, padding: theme.spacing(0.5, 0) }),
});
