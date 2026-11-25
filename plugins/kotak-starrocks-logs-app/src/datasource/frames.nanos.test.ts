import { createDataFrame, FieldType } from '@grafana/data';

import { resolveConfig, resolveTenant } from '../config/config';
import { concatFrames, subMillisecondNanos, toLogsFrame } from './frames';

describe('sub-millisecond order (42 % of lines share a millisecond on UAT)', () => {
  it('reads the nanoseconds within the millisecond from the exact text', () => {
    expect(subMillisecondNanos('2026-11-24 22:37:43.157123')).toBe(123_000);
    expect(subMillisecondNanos('2026-11-24 22:37:43.157')).toBe(0);
    expect(subMillisecondNanos('2026-11-24 22:37:43.1')).toBe(0);
    expect(subMillisecondNanos('2026-11-24 22:37:43')).toBe(0);
    expect(subMillisecondNanos(undefined)).toBe(0);
  });

  it('the logs frame timestamp carries nanos (Grafana sorts by them)', () => {
    const { config } = resolveConfig({});
    const frame = createDataFrame({
      fields: [
        { name: '__ms', type: FieldType.number, values: [1000, 1000] },
        { name: '__ts', type: FieldType.string, values: ['1970-01-01 00:00:01.000900', '1970-01-01 00:00:01.000100'] },
        { name: 'message', type: FieldType.string, values: ['b', 'a'] },
        { name: 'detected_level', type: FieldType.string, values: ['info', 'info'] },
      ],
    });
    const f = toLogsFrame(frame, { tenant: resolveTenant(config, 'v'), refId: 'A' });
    expect(f.fields[0].name).toBe('timestamp');
    expect(f.fields[0].nanos).toEqual([900_000, 100_000]);
  });
});

describe('concatFrames (windows of a newest-first search)', () => {
  const a = createDataFrame({
    refId: 'A',
    fields: [
      { name: 'x', values: [1, 2] },
      { name: 'y', values: ['a', 'b'] },
    ],
  });
  const b = createDataFrame({
    fields: [
      { name: 'x', values: [3] },
      { name: 'y', values: ['c'] },
    ],
  });
  const other = createDataFrame({ fields: [{ name: 'z', values: [9] }] });

  it('joins rows in order and keeps the first frame refId', () => {
    const j = concatFrames([a, b]);
    expect(j.fields[0].values).toEqual([1, 2, 3]);
    expect(j.fields[1].values).toEqual(['a', 'b', 'c']);
    expect(j.refId).toBe('A');
    expect(j.length).toBe(3);
  });

  it('returns a single frame as it is, and skips frames of another shape', () => {
    expect(concatFrames([a])).toBe(a);
    expect(concatFrames([a, other, b]).fields[0].values).toEqual([1, 2, 3]);
  });
});
