import type { KeyboardEvent } from 'react';

export function radioGroupKeyboard(event: KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  if (target.getAttribute('role') !== 'radio' || target.closest('[role="radiogroup"]') !== event.currentTarget) return;
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const radios = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    .filter(item => !item.disabled && item.closest('[role="radiogroup"]') === event.currentTarget);
  const index = radios.indexOf(target as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? radios.length - 1
    : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + radios.length) % radios.length;
  event.preventDefault();
  event.stopPropagation();
  radios[next]?.focus();
  radios[next]?.click();
}
