import { useEffect, useRef } from 'react';

/** Non-modal panels remain tabbable with the scene and return to their opener. */
export function usePanelFocus(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const panel = ref.current;
    const opener = document.activeElement;
    panel?.focus();
    function dismiss(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
    }
    panel?.addEventListener('keydown', dismiss);
    return () => {
      panel?.removeEventListener('keydown', dismiss);
      if (document.activeElement === document.body || panel?.contains(document.activeElement)) {
        const target = opener instanceof HTMLElement && opener !== document.body && opener.isConnected
          ? opener : panel?.id ? document.querySelector<HTMLElement>(`[aria-controls="${panel.id}"]`) : null;
        target?.focus({ preventScroll: true });
      }
    };
  }, []);
  return ref;
}
