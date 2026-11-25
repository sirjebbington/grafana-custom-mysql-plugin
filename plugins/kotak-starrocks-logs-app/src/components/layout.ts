import { RefObject, useLayoutEffect, useState } from 'react';

/** Nearest ancestor that scrolls vertically (Grafana's page content), or undefined for the window. */
export function scrollParent(el: HTMLElement | null): HTMLElement | undefined {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const overflowY = window.getComputedStyle(cur).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return cur;
    }
    cur = cur.parentElement;
  }
  return undefined;
}

/**
 * Height that makes an element end at the bottom of the visible page area (its scroll container), so a page
 * fits the window and only the panel inside scrolls. Follows window resizes and header changes (wrapping,
 * notices). Never less than `min`.
 */
export function heightToFill(el: HTMLElement, container: HTMLElement | undefined, bottom: number, min: number): number {
  const rect = el.getBoundingClientRect();
  if (!container) {
    return Math.max(min, Math.floor(window.innerHeight - rect.top - bottom));
  }
  const box = container.getBoundingClientRect();
  // position inside the scrolled content, independent of the current scroll position
  const top = rect.top - box.top + container.scrollTop;
  return Math.max(min, Math.floor(container.clientHeight - top - bottom));
}

export function useFillHeight(ref: RefObject<HTMLElement>, opts: { bottom?: number; min?: number } = {}) {
  // Grafana's page content has 16 px padding below; 32 keeps the page itself from scrolling
  const { bottom = 32, min = 480 } = opts;
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const container = scrollParent(el);
    const update = () => setHeight(heightToFill(el, container, bottom, min));
    update();
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : undefined;
    // the header above can grow (wrapping, notices); the container can be resized
    if (el.parentElement?.parentElement) {
      observer?.observe(el.parentElement.parentElement);
    }
    if (container) {
      observer?.observe(container);
    }
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [ref, bottom, min]);
  return height;
}
