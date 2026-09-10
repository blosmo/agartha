// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const createViewer = vi.hoisted(() => vi.fn());
vi.mock('../apps/web/src/compute/galleryViewer', () => ({ createGalleryViewer: createViewer }));
let observed: IntersectionObserverCallback;
let observer: IntersectionObserver;
function intersect(host: Element, isIntersecting: boolean) {
  observed([{ target: host, isIntersecting } as IntersectionObserverEntry], observer);
}
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); vi.resetModules(); createViewer.mockReset(); });
async function boot() {
  document.body.innerHTML = '<div data-inline-model="chair-family"><img alt="Chair preview"></div><span id="chair-family-status"></span><button data-model-reset="chair-family" hidden>Reset</button>';
  const viewer = { dispose: vi.fn(), reset: vi.fn(), setVisible: vi.fn(), backend: 'webgl' };
  createViewer.mockResolvedValue(viewer);
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { observed = callback; observer = this as unknown as IntersectionObserver; }
    observe() {} disconnect() {}
  });
  await import('../apps/web/src/compute/gallery');
  return { host: document.querySelector('[data-inline-model]')!, viewer };
}
it('loads visible models without a click and pauses rendering offscreen', async () => {
  const {host, viewer} = await boot();
  expect(createViewer).not.toHaveBeenCalled();
  intersect(host, true);
  await vi.waitFor(() => expect(host.getAttribute('data-state')).toBe('ready'));
  expect(createViewer).toHaveBeenCalledOnce();
  expect(viewer.setVisible).toHaveBeenCalledWith(true);
  intersect(host, false);
  expect(viewer.setVisible).toHaveBeenLastCalledWith(false);
  intersect(host, true);
  expect(createViewer).toHaveBeenCalledOnce();
  document.querySelector<HTMLButtonElement>('[data-model-reset]')!.click();
  expect(viewer.reset).toHaveBeenCalledOnce();
});
it('keeps the preview and downloads available when graphics fail', async () => {
  const {host} = await boot();
  createViewer.mockRejectedValueOnce(new Error('No graphics context'));
  intersect(host, true);
  await vi.waitFor(() => expect(document.getElementById('chair-family-status')!.textContent).toContain('Downloads ready'));
  expect(host.getAttribute('data-state')).toBe('poster');
  expect(host.querySelector('img')!.getAttribute('aria-hidden')).toBeNull();
  intersect(host, true); expect(createViewer).toHaveBeenCalledOnce();
});
it('disposes a model that finishes loading after page exit', async () => {
  const {host, viewer} = await boot();
  let resolve!: (value: typeof viewer) => void;
  createViewer.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  intersect(host, true);
  await vi.waitFor(() => expect(createViewer).toHaveBeenCalledOnce());
  window.dispatchEvent(new Event('pagehide')); resolve(viewer);
  await vi.waitFor(() => expect(viewer.dispose).toHaveBeenCalledOnce());
  expect(host.getAttribute('data-state')).not.toBe('ready');
});
it('restores the poster and hides controls after a loaded context fails', async () => {
  const {host, viewer} = await boot();
  intersect(host, true);
  await vi.waitFor(() => expect(host.getAttribute('data-state')).toBe('ready'));
  createViewer.mock.calls[0][3]();
  expect(viewer.dispose).toHaveBeenCalled();
  expect(host.getAttribute('data-state')).toBe('poster');
  expect(host.querySelector('img')!.getAttribute('aria-hidden')).toBeNull();
  expect(document.querySelector<HTMLButtonElement>('[data-model-reset]')!.hidden).toBe(true);
});
