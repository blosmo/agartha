import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentChatPanel } from './AgentChatPanel';

class Stream extends EventTarget {
  static latest: Stream;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) { super(); Stream.latest = this; }
  message(sequence: number, text: string) { this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ id: `chat-${sequence}`, sequence, authorId: 'fixture', author: 'Agent A', text, createdAt: 1000 }) })); }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('renders live text safely, deduplicates reconnects, and closes the connection with the panel', () => {
  vi.stubGlobal('EventSource', Stream);
  const view = render(<AgentChatPanel onClose={() => {}} onInvite={() => {}}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Connecting');
  expect(Stream.latest.url).toBe('/api/chat/events');
  act(() => Stream.latest.dispatchEvent(new Event('ready')));
  expect(screen.getByText('Start a conversation')).toBeInTheDocument();
  act(() => { Stream.latest.message(1, '<script>alert(1)</script>'); Stream.latest.message(1, '<script>alert(1)</script>'); });
  expect(screen.getAllByText('<script>alert(1)</script>')).toHaveLength(1);
  expect(document.querySelector('script')).toBeNull();
  act(() => Stream.latest.onerror?.());
  expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  act(() => { Stream.latest.message(2, 'A reply'); Stream.latest.dispatchEvent(new Event('ready')); });
  expect(screen.getByText('A reply')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Live messages');
  view.unmount(); expect(Stream.latest.close).toHaveBeenCalledOnce();
});

it('leaves an older reading position alone and offers a jump to new messages', () => {
  vi.stubGlobal('EventSource', Stream);
  render(<AgentChatPanel onClose={() => {}} onInvite={() => {}}/>);
  act(() => Stream.latest.message(1, 'Earlier message'));
  const log = screen.getByRole('log');
  Object.defineProperties(log, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 200 } });
  log.scrollTop = 100; fireEvent.scroll(log);
  act(() => Stream.latest.message(2, 'Later message'));
  expect(log.scrollTop).toBe(100);
  fireEvent.click(screen.getByRole('button', { name: 'Jump to latest messages' }));
  expect(log.scrollTop).toBe(1000);
});


it('preserves the displayed history when incoming traffic exceeds the live window', () => {
  vi.stubGlobal('EventSource', Stream);
  render(<AgentChatPanel onClose={() => {}} onInvite={() => {}}/>);
  act(() => { for (let i = 1; i <= 200; i++) Stream.latest.message(i, `Message ${i}`); });
  const log = screen.getByRole('log');
  Object.defineProperties(log, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 200 } });
  log.scrollTop = 100; fireEvent.scroll(log);
  act(() => { for (let i = 201; i <= 450; i++) Stream.latest.message(i, `Message ${i}`); });
  expect(screen.getByText('Message 1')).toBeInTheDocument();
  expect(screen.queryByText('Message 450')).toBeNull();
  expect(log.scrollTop).toBe(100);
  fireEvent.click(screen.getByRole('button', { name: 'Jump to latest messages' }));
  expect(screen.queryByText('Message 1')).toBeNull();
  expect(screen.getByText('Message 450')).toBeInTheDocument();
  expect(log.scrollTop).toBe(1000);
});
