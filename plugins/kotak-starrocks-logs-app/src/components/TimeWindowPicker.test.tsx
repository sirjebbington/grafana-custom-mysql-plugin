import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { dateTimeFormat } from '@grafana/data';
import { EmbeddedScene, SceneReactObject } from '@grafana/scenes';

import { setAppConfig } from '../config/config';
import { CappedTimeRange } from './CappedTimeRange';
import { TimeWindowPicker } from './TimeWindowPicker';

const H = 3_600_000;

function mount(from = 'now-1h', to = 'now') {
  const picker = new TimeWindowPicker({});
  const timeRange = new CappedTimeRange({ from, to, timeZone: 'utc' });
  const scene = new EmbeddedScene({
    $timeRange: timeRange,
    controls: [picker],
    body: new SceneReactObject({ reactNode: <div /> }),
  });
  scene.activate();
  render(<picker.Component model={picker} />);
  return { timeRange };
}

const fmt = (ms: number) => dateTimeFormat(ms, { format: 'YYYY-MM-DD HH:mm', timeZone: 'utc' });
const inputs = () => screen.getAllByTestId('data-testid date-time-input') as HTMLInputElement[];
function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

beforeEach(() => setAppConfig({}));

describe('time control: only ranges of at most 24 hours can be picked', () => {
  it('shows the range; quick ranges stop at "Last 24 hours" (or the configured maximum)', () => {
    setAppConfig({ maxRangeHours: 6 });
    mount();
    expect(screen.getByTestId('time-window-picker').textContent).toContain('Last 1 hour');
    fireEvent.click(screen.getByTestId('time-window-picker'));
    const quick = within(screen.getByTestId('time-window-quick'));
    expect(quick.getByText('Last 6 hours')).toBeInTheDocument();
    expect(quick.queryByText('Last 12 hours')).toBeNull();
    expect(screen.getByText(/At most 6 hours/)).toBeInTheDocument();
  });

  it('a quick range is applied at once and closes the panel', () => {
    const { timeRange } = mount();
    fireEvent.click(screen.getByTestId('time-window-picker'));
    fireEvent.click(screen.getByText('Last 24 hours'));
    expect(timeRange.state.from).toBe('now-24h');
    expect(screen.queryByTestId('time-window-panel')).toBeNull();
  });

  it('absolute range: the end follows the start within 24 hours; a longer end cannot be applied', () => {
    const { timeRange } = mount();
    fireEvent.click(screen.getByTestId('time-window-picker'));
    const start = Math.floor((Date.now() - 48 * H) / 60_000) * 60_000;
    type(inputs()[0], fmt(start));
    // the end moved to 24 hours after the new start (the latest allowed)
    expect(inputs()[1].value).toBe(fmt(start + 24 * H));
    expect(screen.queryByTestId('time-window-error')).toBeNull();
    // an end 30 hours after the start: refused, Apply disabled
    type(inputs()[1], fmt(start + 30 * H));
    expect(screen.getByTestId('time-window-error').textContent).toBe('Pick at most 24 hours');
    expect(screen.getByTestId('time-window-apply')).toBeDisabled();
    // 10 hours: applied as picked (nothing is cut afterwards)
    type(inputs()[1], fmt(start + 10 * H));
    fireEvent.click(screen.getByTestId('time-window-apply'));
    expect(timeRange.state.value.from.valueOf()).toBe(start);
    expect(timeRange.state.value.to.valueOf()).toBe(start + 10 * H);
    expect((timeRange.state as { capped?: unknown }).capped).toBeUndefined();
  });

  it('Cancel and Escape close the panel without changing the range', () => {
    const { timeRange } = mount();
    fireEvent.click(screen.getByTestId('time-window-picker'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('time-window-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('time-window-picker'));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByTestId('time-window-panel')).toBeNull();
    expect(timeRange.state.from).toBe('now-1h');
  });

  it('zoom out doubles up to 24 hours; at 24 hours it is disabled', () => {
    const { timeRange } = mount('now-6h');
    fireEvent.click(screen.getByLabelText('Zoom out time range'));
    const v = timeRange.state.value;
    expect(Math.round((v.to.valueOf() - v.from.valueOf()) / H)).toBe(12);
  });

  it('at 24 hours zoom out is disabled; forward is disabled at now; back moves by the length', () => {
    const { timeRange } = mount('now-24h');
    expect(screen.getByLabelText('Zoom out time range')).toBeDisabled();
    expect(screen.getByLabelText('Move time range forward')).toBeDisabled();
    const before = timeRange.state.value.from.valueOf();
    fireEvent.click(screen.getByLabelText('Move time range back'));
    expect(Math.round((before - timeRange.state.value.from.valueOf()) / H)).toBe(24);
  });
});
