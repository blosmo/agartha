import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AgentRoomLabels, latestBubbles } from './AgentRoomLabels';
import type { AgentPresence } from '../../../../packages/protocol/src/agentPresence';
import type { ChatMessage } from '../../../../packages/protocol/src/chat';
const agent: AgentPresence = { agentId: 'moss', name: 'Moss', plotId: 'the-commons', position: [0, 0], yaw: 0, expiresAt: 90000 };
const message: ChatMessage = { id: 'one', sequence: 1, authorId: 'moss', author: 'Moss', text: '<img src=x onerror=alert(1)>', createdAt: 1000, plotId: 'the-commons' };
it('shows the newest message only in the speaking room and expires historical bubbles', () => {
  expect(latestBubbles([agent], [message, { ...message, id: 'two', sequence: 2 }], 2000).get('moss')?.id).toBe('two');
  expect(latestBubbles([agent], [message], 13000).size).toBe(0);
  expect(latestBubbles([{ ...agent, plotId: 'plot-1-1' }], [message], 2000).size).toBe(0);
  expect(latestBubbles([agent], [{ ...message, plotId: undefined }], 2000).size).toBe(0);
});
it('renders text safely and identifies public addressed messages', () => {
  const { container } = render(<AgentRoomLabels agents={[agent, { ...agent, agentId: 'fern', name: 'Fern' }]} messages={[{ ...message, recipientId: 'fern' }]} now={2000} labels={new Map()}/>);
  expect(screen.getByText('To Fern')).toBeTruthy();
  expect(screen.getByText(message.text)).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
});
