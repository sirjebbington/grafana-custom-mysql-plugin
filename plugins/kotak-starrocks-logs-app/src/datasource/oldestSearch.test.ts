import { findOldest } from './oldestSearch';

const H = 3_600_000;
const D = 24 * H;

function fakeView(oldestMs: number | undefined) {
  const probes: number[] = [];
  const anyBefore = async (ms: number) => {
    probes.push(ms);
    return oldestMs !== undefined && oldestMs < ms;
  };
  const oldestIn = async (fromMs: number, toMs: number) =>
    oldestMs !== undefined && oldestMs >= fromMs && oldestMs < toMs ? oldestMs : undefined;
  return { anyBefore, oldestIn, probes };
}

describe('findOldest', () => {
  const now = Date.UTC(2026, 10, 24, 14, 23, 11);

  it('finds the exact oldest line with a few LIMIT 1 probes', async () => {
    const oldest = now - 137 * D - 5 * H - 1234;
    const v = fakeView(oldest);
    expect(await findOldest(now, v.anyBefore, v.oldestIn)).toBe(oldest);
    expect(v.probes.length).toBeLessThanOrEqual(25);
  });

  it('works when all lines are from the last day', async () => {
    const oldest = now - 3 * H - 17;
    const v = fakeView(oldest);
    expect(await findOldest(now, v.anyBefore, v.oldestIn)).toBe(oldest);
  });

  it('returns undefined for an empty view, after one probe', async () => {
    const v = fakeView(undefined);
    expect(await findOldest(now, v.anyBefore, v.oldestIn)).toBeUndefined();
    expect(v.probes).toEqual([now]);
  });

  it('stops at 2048 days', async () => {
    const v = fakeView(now - 5000 * D);
    const res = await findOldest(now, v.anyBefore, v.oldestIn);
    expect(res).toBeLessThanOrEqual(now - 2048 * D + H);
  });

  it('copes with gaps: only "any line before X" is asked, which is monotonic', async () => {
    // lines 40 days ago and in the last hour, nothing in between
    const oldest = now - 40 * D;
    const anyBefore = async (ms: number) => oldest < ms;
    const oldestIn = async (a: number, b: number) => (oldest >= a && oldest < b ? oldest : undefined);
    expect(await findOldest(now, anyBefore, oldestIn)).toBe(oldest);
  });
});
