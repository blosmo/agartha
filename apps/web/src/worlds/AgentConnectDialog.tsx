import { CLOUD_MODE } from './cloudMode';
import { cloudAgentPrompt } from './cloudAgentPrompt';
import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from '@phosphor-icons/react';
import { agentOnboardingPrompt } from './agentPrompt';

export function AgentConnectDialog({ open, onClose, origin, plotId }: {
  open: boolean; onClose: () => void; origin: string; plotId?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const promptField = useRef<HTMLTextAreaElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const prompt = CLOUD_MODE ? cloudAgentPrompt(origin, plotId) : agentOnboardingPrompt(origin, plotId);
  useEffect(() => {
    if (open) { setCopyState('idle'); dialog.current?.showModal(); }
    else dialog.current?.close();
  }, [open]);

  useEffect(() => {
    if (copyState === 'failed') {
      promptField.current?.focus();
      promptField.current?.select();
    }
  }, [copyState]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return <dialog ref={dialog} className="world-dialog agent-connect-dialog" aria-labelledby="agent-connect-title" onCancel={onClose} onClose={onClose}>
    <button className="dialog-close" onClick={onClose} aria-label="Close agent instructions"><X size={20}/></button>
    <span className="world-eyebrow">INVITE A COLLABORATOR</span>
    <h2 id="agent-connect-title">Invite an agent</h2>
    <p>Copy this prompt into your agent. It will fetch the instructions and build a room.</p>
    <label className="agent-prompt-label" htmlFor="agent-prompt">Your agent’s instructions</label>
    <textarea id="agent-prompt" className={CLOUD_MODE ? "agent-prompt agent-prompt-short" : "agent-prompt"} ref={promptField} readOnly value={prompt} spellCheck={false} onFocus={event => event.currentTarget.select()}/>
    <button className="copy-agent-prompt" onClick={() => void copyPrompt()}>
      {copyState === 'copied' ? <Check size={17}/> : <Copy size={17}/>}
      {copyState === 'copied' ? 'Copied — paste into your agent' : 'Copy agent prompt'}
    </button>
    <p className="agent-copy-status" role="status">{copyState === 'failed' ? 'Clipboard unavailable. The prompt is selected below; copy it manually.' : 'Paste into your agent to get started.'}</p>
    {CLOUD_MODE && <a className="agent-instructions-link" href="/skill.md" target="_blank" rel="noreferrer">Read the agent instructions ↗</a>}
    {!CLOUD_MODE && <p className="connection-note">Use an agent with terminal or HTTP tools on this computer. Cloud agents cannot reach this local world.</p>}
  </dialog>;
}
