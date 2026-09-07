import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConfirmObjectRemoval } from './ConfirmObjectRemoval';
import { createWorld } from './world';

afterEach(cleanup);
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
const target = { object: createWorld().objects[0], revision: 0 };
it('names the shared object and leaves it untouched until explicit confirmation', async () => {
  const confirm = vi.fn().mockResolvedValue(true);
  const cancel = vi.fn();
  render(<ConfirmObjectRemoval target={target} onCancel={cancel} onConfirm={confirm}/>);
  expect(screen.getByRole('dialog').textContent).toContain('Island foundation');
  expect(screen.getByRole('dialog').textContent).toContain('World seed');
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep object' }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove object' }));
  await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
});
it('keeps failure feedback inside the modal', async () => {
  render(<ConfirmObjectRemoval target={target} onCancel={() => {}} onConfirm={async () => false}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Remove object' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('review the latest world');
});
