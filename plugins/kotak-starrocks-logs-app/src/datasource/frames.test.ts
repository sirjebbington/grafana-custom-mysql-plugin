import { DataFrameType, FieldType, createDataFrame, dateTime } from '@grafana/data';

import { resolveConfig, resolveTenant } from '../config/config';
import {
  fnv1a,
  stableIds,
  toLabelOverviewFrames,
  toLogsFrame,
  toPatternFrames,
  toServiceFrames,
  toSeriesFrames,
  UNMATCHED,
} from './frames';

const range = { from: dateTime(0), to: dateTime(180_000), raw: { from: 'now-3m', to: 'now' } };

function tenant(trace = true) {
  const { config } = resolveConfig({
    tenants: trace ? { app_1: { trace: { regex: '(?i)traceid=([0-9a-f]{32})', tempoUid: 'tempo-1' } } } : {},
  });
  return resolveTenant(config, 'vw_eks_app_logs_app_1');
}

const lines = createDataFrame({
  fields: [
    { name: 'observed_timestamp', type: FieldType.time, values: [2000, 1000] },
    { name: '__ts', type: FieldType.string, values: ['1970-01-01 00:00:02.000123', '1970-01-01 00:00:01.000000'] },
    { name: 'message', type: FieldType.string, values: [`level=error msg=x TraceId=${'a'.repeat(32)}`, 'plain line'] },
    { name: 'detected_level', type: FieldType.string, values: ['error', ''] },
    { name: 'k8s_service_name', type: FieldType.string, values: ['proxy', 'proxy'] },
    { name: 'k8s_pod_uid', type: FieldType.string, values: ['u1', ''] },
    { name: '__value', type: FieldType.string, values: ['proxy', 'other'] },
  ],
});

describe('toLogsFrame', () => {
  it('produces a data plane log frame with labels and a hidden exact timestamp', () => {
    const f = toLogsFrame(lines, { tenant: tenant(false), refId: 'A' });
    expect(f.meta?.type).toBe(DataFrameType.LogLines);
    expect(f.fields.map((x) => x.name)).toEqual(['timestamp', 'body', 'severity', 'id', 'labels', '__ts']);
    expect(f.fields[2].values).toEqual(['error', 'unknown']);
    expect(f.fields[4].values[0]).toEqual({ detected_level: 'error', k8s_service_name: 'proxy', k8s_pod_uid: 'u1' });
    expect(f.fields[4].values[1]).toEqual({ detected_level: 'unknown', k8s_service_name: 'proxy' });
    expect(f.fields[5].config.custom?.hidden).toBe(true);
  });

  it('adds a traceID field with an internal Tempo link when configured', () => {
    const f = toLogsFrame(lines, { tenant: tenant(), refId: 'A' });
    const trace = f.fields.find((x) => x.name === 'traceID')!;
    expect(trace.values).toEqual(['a'.repeat(32), null]);
    expect(trace.config.links?.[0].internal?.datasourceUid).toBe('tempo-1');
    expect(trace.config.links?.[0].internal?.query).toEqual({ query: '${__value.raw}', queryType: 'traceql' });
  });

  it('keeps only the rows of one value for service samples', () => {
    const f = toLogsFrame(lines, { tenant: tenant(false), refId: 'A', value: 'other' });
    expect(f.length).toBe(1);
    expect(f.name).toBe('other');
  });
});

describe('series frames', () => {
  it('fills empty buckets with zeros and orders groups', () => {
    const frames = toSeriesFrames(
      [
        { t: 0, group: 'info', c: 2 },
        { t: 120, group: 'error', c: 1 },
      ],
      range,
      60,
      { refId: 'A', order: ['error', 'info'] }
    );
    expect(frames.map((f) => f.name)).toEqual(['error', 'info']);
    expect(frames[0].fields[0].values).toEqual([0, 60000, 120000, 180000]);
    expect(frames[0].fields[1].values).toEqual([0, 0, 1, 0]);
    expect(frames[1].meta?.custom?.total).toBe(2);
  });

  it('service frames are sorted by total volume', () => {
    const src = createDataFrame({
      fields: [
        { name: 't', values: [0, 0, 60] },
        { name: 'v', values: ['a', 'b', 'b'] },
        { name: 'lvl', values: ['info', 'error', 'info'] },
        { name: 'c', values: [1, 5, 5] },
      ],
    });
    const { values, frames } = toServiceFrames(src, range, 60, 'A');
    expect(values).toEqual([
      { value: 'b', total: 10 },
      { value: 'a', total: 1 },
    ]);
    expect(frames.filter((f) => f.meta?.custom?.value === 'b').map((f) => f.name)).toEqual(['error', 'info']);
  });

  it('decodes GROUPING_ID rows per label and skips empty values', () => {
    // labels [a, b]: rows grouped by a have gid 0b01 = 1, rows grouped by b have gid 0b10 = 2
    const src = createDataFrame({
      fields: [
        { name: 't', values: [0, 0, 0, 0] },
        { name: 'a', values: ['x', '', null, null] },
        { name: 'b', values: [null, null, 'y', 'z'] },
        { name: 'gid', values: [1, 1, 2, 2] },
        { name: 'c', values: [3, 9, 4, 1] },
      ],
    });
    const frames = toLabelOverviewFrames(src, ['a', 'b'], range, 60, 'A');
    expect(frames.map((f) => [f.meta?.custom?.label, f.name, f.meta?.custom?.cardinality])).toEqual([
      ['a', 'x', 1],
      ['b', 'y', 2],
      ['b', 'z', 2],
    ]);
  });

  it('names the unmatched pattern bucket', () => {
    const src = createDataFrame({
      fields: [
        { name: 't', values: [0, 0] },
        { name: 'p', values: ['timeout', ''] },
        { name: 'c', values: [1, 4] },
      ],
    });
    expect(toPatternFrames(src, range, 60, 'A').map((f) => f.name)).toEqual([UNMATCHED, 'timeout']);
  });
});

describe('line ids', () => {
  it('are stable across queries (infinite scroll merges pages by id) and unique within a frame', () => {
    const a = toLogsFrame(lines, { tenant: tenant(false), refId: 'A' });
    const b = toLogsFrame(lines, { tenant: tenant(false), refId: 'B' });
    const ids = a.fields.find((f) => f.name === 'id')!.values;
    expect(b.fields.find((f) => f.name === 'id')!.values).toEqual(ids);
    expect(ids[0]).toBe(`1970-01-01 00:00:02.000123_u1_${fnv1a(lines.fields[2].values[0])}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('suffix duplicates', () => {
    expect(stableIds(['x', 'y', 'x', 'x'])).toEqual(['x', 'y', 'x#1', 'x#2']);
    expect(fnv1a('')).toBe('811c9dc5');
  });
});
