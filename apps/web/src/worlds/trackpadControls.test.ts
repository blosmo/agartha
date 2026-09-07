import { describe, expect, it } from 'vitest';
import { OrthographicCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bindTrackpadPan } from './trackpadControls';

describe('trackpad camera gestures', () => {
  it('pans scroll on both axes, zooms pinch, and removes the pan listener', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
    const camera = new OrthographicCamera(-40, 40, 30, -30, .1, 1000);
    camera.position.set(100, 100, 100);
    const controls = new OrbitControls(camera, canvas);
    controls.enableRotate = false;
    controls.update();
    const cleanup = bindTrackpadPan(canvas, controls);
    const start = controls.target.clone();
    const scroll = new WheelEvent('wheel', { deltaX: 30, deltaY: 20, cancelable: true });
    canvas.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(true);
    expect(controls.target.distanceTo(start)).toBeGreaterThan(0);
    expect(camera.zoom).toBe(1);
    const panned = controls.target.clone();
    canvas.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, cancelable: true }));
    expect(camera.zoom).toBeGreaterThan(1);
    expect(controls.target.distanceTo(panned)).toBeLessThan(.00001);
    cleanup();
    const zoom = camera.zoom;
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, cancelable: true }));
    expect(camera.zoom).toBeLessThan(zoom);
    controls.dispose();
  });
});
