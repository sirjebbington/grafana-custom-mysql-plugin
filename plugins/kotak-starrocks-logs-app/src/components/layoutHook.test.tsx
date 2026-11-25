import { act, render } from '@testing-library/react';
import { useRef } from 'react';

import { scrollParent, useFillHeight } from './layout';

function Probe({ onHeight }: { onHeight: (h?: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  onHeight(useFillHeight(ref, { bottom: 10, min: 100 }));
  return <div ref={ref} data-testid="probe" />;
}

describe('useFillHeight / scrollParent', () => {
  it('finds the nearest scrolling ancestor', () => {
    const outer = document.createElement('div');
    outer.style.overflowY = 'auto';
    const inner = document.createElement('div');
    const leaf = document.createElement('div');
    outer.appendChild(inner);
    inner.appendChild(leaf);
    document.body.appendChild(outer);
    expect(scrollParent(leaf)).toBe(outer);
    expect(scrollParent(outer)).toBeUndefined();
    outer.remove();
  });

  it('measures on mount and on window resize', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const heights: Array<number | undefined> = [];
    render(<Probe onHeight={(h) => heights.push(h)} />);
    // jsdom elements sit at top 0: 800 - 0 - 10
    expect(heights[heights.length - 1]).toBe(790);
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(heights[heights.length - 1]).toBe(490);
  });

  it('inside a scrolling container: fills the container below the element, never less than min', () => {
    const container = document.createElement('div');
    container.style.overflowY = 'auto';
    document.body.appendChild(container);
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    const heights: Array<number | undefined> = [];
    render(<Probe onHeight={(h) => heights.push(h)} />, { container });
    expect(heights[heights.length - 1]).toBe(590);
    Object.defineProperty(container, 'clientHeight', { value: 50, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(heights[heights.length - 1]).toBe(100);
    container.remove();
  });
});
