import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from './App';
import { AgentActivityPanel } from '../worlds/AgentActivityPanel';

afterEach(cleanup);

it('opens activity with focus and returns to its trigger on Escape', () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Watch</button>{open && <AgentActivityPanel events={[]} connected following={undefined} onFollow={() => {}} onVisit={() => {}} onClose={() => setOpen(false)}/>}</>;
  }
  render(<Example/>);
  const trigger = screen.getByRole('button', { name: 'Watch' });
  trigger.focus(); fireEvent.click(trigger);
  const panel = screen.getByRole('complementary');
  expect(panel).toHaveFocus();
  fireEvent.keyDown(panel, { key: 'Escape' });
  expect(screen.queryByRole('complementary')).toBeNull();
  expect(trigger).toHaveFocus();
});

it('supports radio arrows, keyboard regions, capture, and reversible terrain replacement', () => {
  render(<App convexUrl={null}/>);
  const pencil = screen.getByRole('radio', { name: 'Pencil' });
  pencil.focus(); fireEvent.keyDown(pencil, { key: 'ArrowRight' });
  expect(screen.getByRole('radio', { name: 'Brush' })).toHaveFocus();
  expect(screen.getByRole('radio', { name: 'Brush' })).toHaveAttribute('aria-checked', 'true');
  expect(within(screen.getByRole('radiogroup', { name: 'Tool' })).getAllByRole('radio').filter(e => e.tabIndex === 0)).toHaveLength(1);
  fireEvent.click(screen.getByRole('radio', { name: 'Marquee' }));
  const board = screen.getByRole('application');
  fireEvent.keyDown(board, { key: 'ArrowRight', shiftKey: true });
  fireEvent.keyDown(board, { key: 'ArrowDown', shiftKey: true });
  expect(document.querySelector('[aria-label="Selection size"]')).toHaveTextContent('2x2');
  fireEvent.keyDown(board, { key: 'Enter' });
  expect(document.querySelector('[aria-label="Selection size"]')).toHaveTextContent('2x2');
  const before = screen.getByTestId('board-cells').getAttribute('data-active-cells');
  fireEvent.click(screen.getByRole('radio', { name: 'Ember Break' }));
  expect(screen.getByRole('button', { name: 'Undo edit' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Undo edit' }));
  expect(screen.getByTestId('board-cells')).toHaveAttribute('data-active-cells', before);
});

it('keeps canvas keyboard shortcuts from consuming nested zoom-button activation', () => {
  render(<App convexUrl={null}/>);
  const selected = document.querySelector('[data-agent-id="latest-event-status"]')?.textContent;
  fireEvent.keyDown(screen.getByRole('button', { name: 'Zoom in' }), { key: 'Enter' });
  expect(document.querySelector('[data-agent-id="latest-event-status"]')).toHaveTextContent(selected!);
});
