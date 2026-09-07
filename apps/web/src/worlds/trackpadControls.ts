import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Keep pinch-to-zoom with OrbitControls, and route ordinary scrolling to pan. */
export function bindTrackpadPan(element: HTMLElement, controls: OrbitControls) {
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || !controls.enabled || !controls.enablePan) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
    controls.pan(-event.deltaX * scale, -event.deltaY * scale);
  };
  element.addEventListener('wheel', wheel, { capture: true, passive: false });
  return () => element.removeEventListener('wheel', wheel, true);
}
