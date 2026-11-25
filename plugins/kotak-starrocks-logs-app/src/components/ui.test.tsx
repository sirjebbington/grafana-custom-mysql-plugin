import { act, fireEvent, render, screen } from '@testing-library/react';

import { createDataFrame, FieldType } from '@grafana/data';

import { ContextScope } from '../datasource/ContextScope';
import { Chip, Elapsed, ErrorBox, SampleList, ScanGuard } from './ui';

describe('small UI pieces', () => {
  it('Elapsed shows "…" first, then seconds', () => {
    jest.useFakeTimers();
    render(<Elapsed />);
    expect(screen.getByTestId('elapsed').textContent).toBe('…');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('elapsed').textContent).toBe(' 3 s');
    jest.useRealTimers();
  });

  it('ScanGuard explains the long scan and offers both ways out', () => {
    const onRun = jest.fn();
    const onShrink = jest.fn();
    render(
      <ScanGuard hours={12} max={6} reason="Counting patterns reads every line." onRun={onRun} onShrink={onShrink} />
    );
    expect(screen.getByTestId('scan-guard').textContent).toContain('12.0 hours');
    fireEvent.click(screen.getByText('Run anyway'));
    fireEvent.click(screen.getByText('Use the last 6 hours'));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onShrink).toHaveBeenCalledTimes(1);
  });

  it('Chip removes itself through its button', () => {
    const onRemove = jest.fn();
    render(
      <Chip onRemove={onRemove} testId="c">
        line contains x
      </Chip>
    );
    fireEvent.click(screen.getByLabelText('Remove filter'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('SampleList: lines with time, or loading / empty / error text', () => {
    const frame = createDataFrame({
      fields: [
        { name: 'timestamp', type: FieldType.time, values: [Date.UTC(2026, 10, 25, 4, 7, 43, 157)] },
        { name: 'body', type: FieldType.string, values: ['hello'] },
        { name: 'severity', type: FieldType.string, values: ['info'] },
      ],
    });
    const { rerender } = render(<SampleList frame={frame} />);
    expect(screen.getByTestId('service-samples').textContent).toContain('hello');
    rerender(<SampleList loading />);
    expect(screen.getByText('Loading lines…')).toBeTruthy();
    rerender(<SampleList />);
    expect(screen.getByText('No lines')).toBeTruthy();
    rerender(<SampleList error="denied" />);
    expect(screen.getByText('denied')).toBeTruthy();
  });

  it('ErrorBox shows the title and the message', () => {
    render(<ErrorBox title="Query failed" error="boom" />);
    expect(screen.getByText('Query failed')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
  });

  it('ContextScope lists the identifying labels that are set, matched one first, and explains the pin', () => {
    render(
      <ContextScope
        podColumn="k8s_pod_uid"
        labels={{ k8s_pod_uid: 'u-1', k8s_pod_name: 'p-1', k8s_service_name: 'apilog', other: 'x' }}
      />
    );
    const text = screen.getByTestId('context-scope').textContent ?? '';
    expect(text).toContain('k8s_pod_uid="u-1"');
    expect(text).toContain('k8s_pod_name="p-1"');
    expect(text).toContain('k8s_service_name="apilog"');
    expect(text).not.toContain('other');
    expect(text).not.toContain('k8s_namespace_name');
    expect(text).toContain('pinned');
  });
});
