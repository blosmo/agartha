import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RoomJoystick } from './RoomJoystick';

beforeEach(() => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('clamps the stick, ignores a second pointer and stops on cancellation', () => {
  const onMove = vi.fn(); render(<RoomJoystick onMove={onMove}/>);
  const stick = screen.getByRole('group', { name: 'Movement joystick' });
  vi.spyOn(stick, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 116, height: 116 } as DOMRect);
  fireEvent.pointerDown(stick, { pointerId: 1, clientX: 58, clientY: 0 });
  expect(onMove).toHaveBeenLastCalledWith({ x: 0, y: -1 });
  fireEvent.pointerDown(stick, { pointerId: 2, clientX: 116, clientY: 58 });
  expect(onMove).toHaveBeenCalledTimes(1);
  fireEvent.pointerUp(stick, { pointerId: 2 }); expect(onMove).toHaveBeenCalledTimes(1);
  fireEvent.pointerCancel(stick, { pointerId: 1 }); expect(onMove).toHaveBeenLastCalledWith({ x: 0, y: 0 });
});
it('stops movement on blur and unmount', () => {
  const onMove = vi.fn(); const view = render(<RoomJoystick onMove={onMove}/>);
  fireEvent.blur(window); expect(onMove).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  onMove.mockClear(); view.unmount(); expect(onMove).toHaveBeenCalledWith({ x: 0, y: 0 });
});
