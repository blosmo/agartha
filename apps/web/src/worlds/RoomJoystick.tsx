import React, { useEffect, useRef, useState } from 'react';

type Point = { x: number; y: number };
export function RoomJoystick({ onMove }: { onMove: (point: Point) => void }) {
  const pointer = useRef<number | null>(null);
  const callback = useRef(onMove); callback.current = onMove;
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  function reset() { pointer.current = null; setPosition({ x: 0, y: 0 }); callback.current({ x: 0, y: 0 }); }
  useEffect(() => {
    const clear = () => reset();
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', clear);
    return () => { window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear); callback.current({ x: 0, y: 0 }); };
  }, []);
  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (pointer.current !== event.pointerId) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left - box.width / 2) / 38;
    const y = (event.clientY - box.top - box.height / 2) / 38;
    const length = Math.max(1, Math.hypot(x, y));
    const point = { x: x / length, y: y / length };
    setPosition(point); callback.current(point);
  }
  return <div className="room-joystick" role="group" aria-label="Movement joystick" onPointerDown={event => {
    if (pointer.current !== null) return;
    event.preventDefault(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); move(event);
  }} onPointerMove={move} onPointerUp={event => { if (pointer.current === event.pointerId) reset(); }} onPointerCancel={reset} onLostPointerCapture={reset}>
    <span className="room-joystick-thumb" style={{ transform: `translate(${position.x * 38}px, ${position.y * 38}px)` }} />
    <span className="sr-only">Drag to move. Keyboard: W A S D or arrow keys.</span>
  </div>;
}
