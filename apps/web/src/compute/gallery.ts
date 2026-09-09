import type { GalleryViewer } from './galleryViewer';

const dialog = document.querySelector<HTMLDialogElement>('#gallery-dialog');
if (dialog) {
  const host = dialog.querySelector<HTMLElement>('.gallery-viewer')!;
  const poster = dialog.querySelector<HTMLImageElement>('.gallery-poster')!;
  const status = dialog.querySelector<HTMLElement>('#gallery-status')!;
  let lifetime: AbortController | undefined, viewer: GalleryViewer | undefined;
  let opener: HTMLButtonElement | undefined;
  function fallback() {
    viewer?.dispose(); viewer = undefined;
    host.dataset.state = 'poster'; delete host.dataset.backend;
    status.textContent = '3D view is unavailable in this browser. You can still download the model and editable source.';
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-gallery-model]')) {
    button.addEventListener('click', () => {
      opener = button;
      const slug = button.dataset.galleryModel!;
      const title = button.dataset.title!;
      dialog.querySelector('#gallery-title')!.textContent = title;
      dialog.querySelector('#gallery-description')!.textContent = button.dataset.description!;
      poster.src = `/compute/gallery/${slug}/preview.jpg`; poster.alt = title;
      dialog.querySelector<HTMLAnchorElement>('#gallery-glb')!.href = `/compute/gallery/${slug}/model.glb`;
      dialog.querySelector<HTMLAnchorElement>('#gallery-source')!.href = `/compute/gallery/${slug}/source.zip`;
      dialog.querySelector<HTMLAnchorElement>('#gallery-provenance')!.href = `/compute/gallery/${slug}/provenance.json`;
      host.dataset.state = 'loading'; status.textContent = 'Loading interactive model…';
      const run = new AbortController(); lifetime = run;
      dialog.showModal();
      void import('./galleryViewer').then(({ createGalleryViewer }) => createGalleryViewer(host, slug, run.signal, () => { if (!run.signal.aborted) fallback(); }))
        .then(value => {
          if (run.signal.aborted) { value.dispose(); return; }
          viewer = value; host.dataset.state = 'ready'; host.dataset.backend = value.backend;
          status.textContent = 'Drag to orbit · Scroll to zoom · Arrow keys to rotate · + / − to zoom';
        }).catch(() => { if (!run.signal.aborted) fallback(); });
    });
  }
  dialog.querySelector('#gallery-close')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('#gallery-reset')!.addEventListener('click', () => viewer?.reset());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => { lifetime?.abort(); viewer?.dispose(); viewer = undefined; opener?.focus({ preventScroll: true }); });
}
