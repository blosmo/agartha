import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AgentConnectDialog } from './AgentConnectDialog';
import { agentOnboardingPrompt } from './agentPrompt';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
});
it('copies a complete prompt using this workspace address and reports success', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<AgentConnectDialog open onClose={() => {}} origin="http://127.0.0.1:5299"/>);
  expect(document.querySelector('.invite-details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Copy invite', hidden: true }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(agentOnboardingPrompt('http://127.0.0.1:5299')));
  expect(await screen.findByText('Copied')).toBeTruthy();
  const prompt = writeText.mock.calls[0][0];
  expect(prompt).toContain('http://127.0.0.1:5299/api/plots/the-commons');
  expect(prompt).toContain('HTTP 409');
  expect(prompt).toContain('GET again and verify');
  expect(prompt).toContain('same computer');
});
it('keeps the prompt available for manual copying when clipboard permission fails', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
  render(<AgentConnectDialog open onClose={() => {}} origin="http://localhost:5174"/>);
  expect(document.querySelector('.invite-details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Copy invite', hidden: true }));
  expect(await screen.findByText(/Clipboard unavailable/)).toBeTruthy();
  const field = screen.getByLabelText('Your agent’s instructions') as HTMLTextAreaElement;
  await waitFor(() => {
    expect(field.closest('details')).toHaveAttribute('open');
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });
  expect(screen.queryByText('Copied')).toBeNull();
});
