import { heightToFill } from './layout';

function el(top: number): HTMLElement {
  return { getBoundingClientRect: () => ({ top }) } as unknown as HTMLElement;
}

function container(top: number, clientHeight: number, scrollTop: number): HTMLElement {
  return { getBoundingClientRect: () => ({ top }), clientHeight, scrollTop } as unknown as HTMLElement;
}

describe('heightToFill (the Logs tab ends at the bottom of the visible page)', () => {
  it('fills the scroll container below the element, whatever the scroll position', () => {
    // container from y=80, 900 px tall; the tab starts 300 px into the content
    expect(heightToFill(el(380), container(80, 900, 0), 16, 100)).toBe(900 - 300 - 16);
    // scrolled by 200: the tab is 200 px higher on screen, same height
    expect(heightToFill(el(180), container(80, 900, 200), 16, 100)).toBe(900 - 300 - 16);
  });

  it('never below the minimum (small windows scroll the page instead)', () => {
    expect(heightToFill(el(380), container(80, 400, 0), 16, 480)).toBe(480);
  });

  it('without a scroll container: the window', () => {
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
    expect(heightToFill(el(250), undefined, 10, 100)).toBe(740);
  });
});
