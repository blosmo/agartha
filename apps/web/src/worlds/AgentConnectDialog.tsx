import { playgroundAgentPrompt } from './playground/agentPrompt';
import { BlenderModelingOffer } from './BlenderModelingOffer';
import { CLOUD_MODE } from './cloudMode';
import { cloudAgentPrompt } from './cloudAgentPrompt';
import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from '@phosphor-icons/react';
import { agentOnboardingPrompt } from './agentPrompt';

export function AgentConnectDialog({ open, onClose, origin, plotId, projectId }: {
  open: boolean; onClose: () => void; origin: string; plotId?: string; projectId?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const promptField = useRef<HTMLTextAreaElement>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const prompt = projectId ? playgroundAgentPrompt(origin, projectId) : CLOUD_MODE ? cloudAgentPrompt(origin, plotId) : agentOnboardingPrompt(origin, plotId);
  useEffect(() => {
    if (open) { setCopyState('idle'); setShowPrompt(false); dialog.current?.showModal(); }
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
      setShowPrompt(true);
      setCopyState('failed');
    }
  }

  return <dialog ref={dialog} className="world-dialog agent-connect-dialog" aria-labelledby="agent-connect-title" onCancel={onClose} onClose={onClose}>
    <button className="dialog-close" onClick={onClose} aria-label="Close agent instructions"><X size={20}/></button>
    <h2 id="agent-connect-title">Invite an agent</h2>
    <p>{projectId ? 'Paste the invite into your agent to join this project.' : 'Paste the invite into your agent to start building.'}</p>
    <details className="invite-details" open={showPrompt} onToggle={event => setShowPrompt(event.currentTarget.open)}><summary>View instructions</summary>
    <label className="agent-prompt-label" htmlFor="agent-prompt">Your agent’s instructions</label>
    <textarea id="agent-prompt" className={CLOUD_MODE ? "agent-prompt agent-prompt-short" : "agent-prompt"} ref={promptField} readOnly value={prompt} spellCheck={false} onFocus={event => event.currentTarget.select()}/>
    </details>
    <button className="copy-agent-prompt" onClick={() => void copyPrompt()}>
      {copyState === 'copied' ? <Check size={17}/> : <Copy size={17}/>}
      {copyState === 'copied' ? 'Copied' : 'Copy invite'}
    </button>
    <p className="agent-copy-status" role="status">{copyState === 'failed' ? 'Clipboard unavailable. The prompt is selected above; copy it manually.' : copyState === 'copied' ? 'Prompt copied. Paste it into your agent.' : ''}</p>
    {CLOUD_MODE && <a className="agent-instructions-link" href="/skill.md" target="_blank" rel="noreferrer">Agent guide ↗</a>}
    {!CLOUD_MODE && <p className="connection-note">Local world · use an agent on this computer.</p>}
    {CLOUD_MODE && <BlenderModelingOffer compact/>}
  </dialog>;
}
