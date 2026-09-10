import type { GalleryViewer } from './galleryViewer';

const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-inline-model]'));
if (hosts.length) {
  const lifetime = new AbortController();
  const viewers = new Map<HTMLElement, GalleryViewer>();
  const pending = new Set<HTMLElement>();
  const failed = new Set<HTMLElement>();
  const visible = new Set<HTMLElement>();
  function fallback(host: HTMLElement) {
    failed.add(host);
    viewers.get(host)?.dispose(); viewers.delete(host);
    host.dataset.state = 'poster'; delete host.dataset.backend;
    host.querySelector('img')?.removeAttribute('aria-hidden');
    document.querySelector(`[data-model-reset="${host.dataset.inlineModel}"]`)?.setAttribute('hidden', '');
    document.getElementById(`${host.dataset.inlineModel}-status`)!.textContent = '3D unavailable · Downloads ready';
  }
  async function load(host: HTMLElement) {
    if (pending.has(host) || viewers.has(host) || failed.has(host)) return;
    pending.add(host); host.dataset.state = 'loading';
    document.getElementById(`${host.dataset.inlineModel}-status`)!.textContent = 'Loading 3D…';
    try {
      const { createGalleryViewer } = await import('./galleryViewer');
      if (lifetime.signal.aborted) return;
      const viewer = await createGalleryViewer(host, host.dataset.inlineModel!, lifetime.signal, () => fallback(host));
      if (lifetime.signal.aborted) { viewer.dispose(); return; }
      viewers.set(host, viewer); viewer.setVisible(visible.has(host));
      host.dataset.state = 'ready'; host.dataset.backend = viewer.backend;
      host.querySelector('img')?.setAttribute('aria-hidden', 'true');
      document.getElementById(`${host.dataset.inlineModel}-status`)!.textContent = 'Drag to explore';
      const reset = document.querySelector<HTMLButtonElement>(`[data-model-reset="${host.dataset.inlineModel}"]`)!;
      reset.hidden = false;
      reset.addEventListener('click', () => viewer.reset(), { signal: lifetime.signal });
    } catch { if (!lifetime.signal.aborted) fallback(host); }
    finally { pending.delete(host); }
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const host = entry.target as HTMLElement;
      if (entry.isIntersecting) { visible.add(host); void load(host); }
      else visible.delete(host);
      viewers.get(host)?.setVisible(entry.isIntersecting);
    }
  }, { rootMargin: '100px 0px' });
  hosts.forEach(host => observer.observe(host));
  window.addEventListener('pagehide', event => {
    if (event.persisted) { viewers.forEach(viewer => viewer.setVisible(false)); return; }
    lifetime.abort(); observer.disconnect(); viewers.forEach(viewer => viewer.dispose()); viewers.clear();
  });
  window.addEventListener('pageshow', () => viewers.forEach((viewer, host) => viewer.setVisible(visible.has(host))));
}
