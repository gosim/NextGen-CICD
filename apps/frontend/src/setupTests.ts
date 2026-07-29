import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mantine benötigt matchMedia in jsdom.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// Mantine benötigt ResizeObserver in jsdom.
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// jsdom implementiert scrollIntoView nicht — Mantine-Select ruft es auf.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
