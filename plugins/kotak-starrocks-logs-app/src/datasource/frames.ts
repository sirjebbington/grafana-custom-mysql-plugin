import { DataFrame, DataFrameType, DataLink, Field, FieldType, TimeRange, createDataFrame } from '@grafana/data';

import { DETECTED_LEVEL, LEVELS, POD_UID_COLUMN, TIME_COLUMN } from '../constants';
import { ResolvedTenant, TraceConfig } from '../config/config';

const INTERNAL_COLUMNS = new Set([TIME_COLUMN, '__ts', 'message', DETECTED_LEVEL, '__value']);

function col(frame: DataFrame, name: string): unknown[] {
  return frame.fields.find((f) => f.name === name)?.values ?? [];
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/** JS RegExp from a RE2-style pattern (a leading (?i) becomes the i flag). */
export function toJsRegex(re: string): RegExp {
  return re.startsWith('(?i)') ? new RegExp(re.slice(4), 'i') : new RegExp(re);
}

export function traceLink(trace: TraceConfig): DataLink {
  return {
    title: trace.linkTitle ?? 'View trace',
    url: '',
    internal: {
      datasourceUid: trace.tempoUid,
      datasourceName: 'Tempo',
      // same query shape as Loki derived fields for Tempo
      query: { query: '${__value.raw}', queryType: 'traceql' },
    },
  };
}

export interface LogsFrameOptions {
  tenant: ResolvedTenant;
  refId: string;
  /** when set, only rows whose __value equals this are kept (service samples) */
  value?: string;
}

/**
 * Converts the SQL result of a line query into a Grafana logs data frame (data plane "log-lines" format):
 * timestamp, body, severity, id, labels (all non-empty view columns plus detected_level), and a traceID
 * field with an Explore link to Tempo when the tenant has a trace regex.
 */
export function toLogsFrame(frame: DataFrame, opts: LogsFrameOptions): DataFrame {
  const ts = col(frame, TIME_COLUMN);
  const tsRaw = col(frame, '__ts');
  const msg = col(frame, 'message');
  const lvl = col(frame, DETECTED_LEVEL);
  const groupValues = col(frame, '__value');
  const labelFields = frame.fields.filter((f) => !INTERNAL_COLUMNS.has(f.name));

  const rows: number[] = [];
  for (let i = 0; i < frame.length; i++) {
    if (opts.value === undefined || str(groupValues[i]) === opts.value) {
      rows.push(i);
    }
  }

  const labels = rows.map((i) => {
    const o: Record<string, string> = { [DETECTED_LEVEL]: str(lvl[i]) || 'unknown' };
    for (const f of labelFields) {
      const v = str(f.values[i]);
      if (v !== '') {
        o[f.name] = v;
      }
    }
    return o;
  });

  const fields: Field[] = [
    { name: 'timestamp', type: FieldType.time, config: {}, values: rows.map((i) => ts[i]) },
    { name: 'body', type: FieldType.string, config: {}, values: rows.map((i) => str(msg[i])) },
    { name: 'severity', type: FieldType.string, config: {}, values: rows.map((i) => str(lvl[i]) || 'unknown') },
    {
      name: 'id',
      type: FieldType.string,
      config: {},
      values: rows.map((i, n) => `${str(tsRaw[i])}_${labels[n][POD_UID_COLUMN] ?? ''}_${n}`),
    },
    { name: 'labels', type: FieldType.other, config: {}, values: labels },
    // exact microsecond timestamp, used by "show context"; not shown in log details
    {
      name: '__ts',
      type: FieldType.string,
      config: { custom: { hidden: true } },
      values: rows.map((i) => str(tsRaw[i])),
    },
  ];

  const trace = opts.tenant.trace;
  if (trace) {
    const re = toJsRegex(trace.regex);
    fields.push({
      name: 'traceID',
      type: FieldType.string,
      config: { links: [traceLink(trace)] },
      values: rows.map((i) => re.exec(str(msg[i]))?.[1] ?? null),
    });
  }

  return createDataFrame({
    refId: opts.refId,
    name: opts.value,
    fields,
    meta: {
      ...frame.meta,
      type: DataFrameType.LogLines,
      preferredVisualisationType: 'logs',
      custom: { ...frame.meta?.custom, value: opts.value },
    },
  });
}

/** Distinct values of __value in a samples result, in order of appearance. */
export function groupValuesOf(frame: DataFrame): string[] {
  return Array.from(new Set(col(frame, '__value').map(str)));
}

/** Bucket start times (ms) covering the range, aligned like the SQL bucket expression. */
export function bucketTimes(range: TimeRange, bucketSeconds: number): number[] {
  const b = bucketSeconds * 1000;
  const start = Math.floor(range.from.valueOf() / b) * b;
  const end = range.to.valueOf();
  const out: number[] = [];
  for (let t = start; t <= end && out.length < 5000; t += b) {
    out.push(t);
  }
  return out;
}

export interface SeriesRow {
  t: number; // epoch seconds (bucket start)
  group: string;
  c: number;
  meta?: Record<string, unknown>;
}

/**
 * One time series frame per group, with zeros for empty buckets so stacked bars line up. Groups are ordered
 * by `order` when given (e.g. levels), otherwise by total, descending.
 */
export function toSeriesFrames(
  rows: SeriesRow[],
  range: TimeRange,
  bucketSeconds: number,
  opts: { refId: string; order?: readonly string[]; topN?: number; custom?: (group: string) => Record<string, unknown> }
): DataFrame[] {
  const times = bucketTimes(range, bucketSeconds);
  const index = new Map(times.map((t, i) => [t, i]));
  const byGroup = new Map<string, number[]>();
  const totals = new Map<string, number>();
  for (const r of rows) {
    let vals = byGroup.get(r.group);
    if (!vals) {
      vals = new Array(times.length).fill(0);
      byGroup.set(r.group, vals);
    }
    const i = index.get(r.t * 1000);
    if (i !== undefined) {
      vals[i] += r.c;
    }
    totals.set(r.group, (totals.get(r.group) ?? 0) + r.c);
  }
  let groups = Array.from(byGroup.keys());
  if (opts.order) {
    const order = opts.order;
    groups.sort(
      (a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
    );
  } else {
    groups.sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
  }
  if (opts.topN !== undefined) {
    groups = groups.slice(0, opts.topN);
  }
  return groups.map((g) =>
    createDataFrame({
      refId: opts.refId,
      name: g,
      fields: [
        { name: 'Time', type: FieldType.time, config: {}, values: times },
        { name: g, type: FieldType.number, config: { displayNameFromDS: g }, values: byGroup.get(g)! },
      ],
      meta: { custom: { group: g, total: totals.get(g) ?? 0, ...opts.custom?.(g) } },
    })
  );
}

export function rowsOf(frame: DataFrame | undefined, groupColumn: string): SeriesRow[] {
  if (!frame) {
    return [];
  }
  const t = col(frame, 't');
  const g = col(frame, groupColumn);
  const c = col(frame, 'c');
  return Array.from({ length: frame.length }, (_, i) => ({ t: Number(t[i]), group: str(g[i]), c: Number(c[i]) }));
}

/** Level volume frames, ordered error, warn, info, debug, unknown. */
export function toLevelFrames(frame: DataFrame | undefined, range: TimeRange, bucket: number, refId: string) {
  return toSeriesFrames(rowsOf(frame, 'g'), range, bucket, { refId, order: LEVELS });
}

/**
 * Service grid: one frame per (value, level). meta.custom.value/total let the scene build one panel per value;
 * values are returned sorted by total volume.
 */
export function toServiceFrames(frame: DataFrame | undefined, range: TimeRange, bucket: number, refId: string) {
  if (!frame) {
    return { frames: [] as DataFrame[], values: [] as Array<{ value: string; total: number }> };
  }
  const t = col(frame, 't');
  const v = col(frame, 'v');
  const l = col(frame, 'lvl');
  const c = col(frame, 'c');
  const byValue = new Map<string, SeriesRow[]>();
  const totals = new Map<string, number>();
  for (let i = 0; i < frame.length; i++) {
    const value = str(v[i]);
    const rows = byValue.get(value) ?? [];
    rows.push({ t: Number(t[i]), group: str(l[i]) || 'unknown', c: Number(c[i]) });
    byValue.set(value, rows);
    totals.set(value, (totals.get(value) ?? 0) + Number(c[i]));
  }
  const values = Array.from(totals.entries())
    .map(([value, total]) => ({ value, total }))
    .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
  const frames = values.flatMap(({ value }) =>
    toSeriesFrames(byValue.get(value)!, range, bucket, { refId, order: LEVELS, custom: () => ({ value }) })
  );
  return { frames, values };
}

/**
 * Labels overview (GROUPING SETS result): per label, the top values as series. meta.custom carries the label,
 * the value and the label's cardinality.
 */
export function toLabelOverviewFrames(
  frame: DataFrame | undefined,
  labels: string[],
  range: TimeRange,
  bucket: number,
  refId: string,
  topN = 5
): DataFrame[] {
  if (!frame) {
    return [];
  }
  const present = labels.filter((l) => frame.fields.some((f) => f.name === l));
  const t = col(frame, 't');
  const gid = col(frame, 'gid');
  const c = col(frame, 'c');
  const cols = present.map((l) => col(frame, l));
  const n = present.length;
  const perLabel = new Map<string, SeriesRow[]>();
  for (let i = 0; i < frame.length; i++) {
    const id = Number(gid[i]);
    // GROUPING_ID: bit (n-1-k) is 0 when label k is part of the row's grouping set
    const k = present.findIndex((_, idx) => ((id >> (n - 1 - idx)) & 1) === 0);
    if (k < 0) {
      continue;
    }
    const value = str(cols[k][i]);
    if (value === '') {
      continue;
    }
    const rows = perLabel.get(present[k]) ?? [];
    rows.push({ t: Number(t[i]), group: value, c: Number(c[i]) });
    perLabel.set(present[k], rows);
  }
  return present.flatMap((label) => {
    const rows = perLabel.get(label) ?? [];
    const cardinality = new Set(rows.map((r) => r.group)).size;
    return toSeriesFrames(rows, range, bucket, { refId, topN, custom: () => ({ label, cardinality }) });
  });
}

/** Value breakdown (one label or message field): series per value, top N by volume. */
export function toValueFrames(
  frame: DataFrame | undefined,
  range: TimeRange,
  bucket: number,
  refId: string,
  topN = 30
) {
  return toSeriesFrames(rowsOf(frame, 'v'), range, bucket, { refId, topN, custom: (g) => ({ value: g }) });
}

export const UNMATCHED = '(unmatched)';

export function toPatternFrames(frame: DataFrame | undefined, range: TimeRange, bucket: number, refId: string) {
  const rows = rowsOf(frame, 'p').map((r) => ({ ...r, group: r.group === '' ? UNMATCHED : r.group }));
  return toSeriesFrames(rows, range, bucket, { refId, custom: (g) => ({ pattern: g }) });
}

/** Plain table of the line query result (Table view). Internal helper columns are removed. */
export function toTableFrame(frame: DataFrame, refId: string): DataFrame {
  return createDataFrame({
    refId,
    fields: frame.fields.filter((f) => f.name !== '__ts' && f.name !== '__value'),
    meta: { ...frame.meta, preferredVisualisationType: 'table' },
  });
}
