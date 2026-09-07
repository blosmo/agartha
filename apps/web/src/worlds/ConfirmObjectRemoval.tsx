import React, { useEffect, useRef, useState } from 'react';
import type { WorldObject } from './world';

export function ConfirmObjectRemoval({ target, onCancel, onConfirm }: {
  target?: { object: WorldObject; revision: number };
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (target) { setFailed(false); dialog.current?.showModal(); }
    else dialog.current?.close();
  }, [target]);
  return <dialog ref={dialog} className="world-dialog" aria-labelledby="remove-object-title" aria-describedby="remove-object-description"
    onCancel={event => { if (pending) event.preventDefault(); else onCancel(); }}>
    <h2 id="remove-object-title">Remove {target?.object.name}?</h2>
    <p id="remove-object-description">This removes {target?.object.author}’s contribution from the shared world for everyone. This action cannot be undone.</p>
    {failed && <p role="alert">Unable to remove the object. Keep it and review the latest world before trying again.</p>}
    <div className="removal-actions">
      <button autoFocus disabled={pending} onClick={onCancel}>Keep object</button>
      <button className="destructive-action" disabled={pending} onClick={async () => {
        setPending(true);
        try { setFailed(!(await onConfirm())); } catch { setFailed(true); } finally { setPending(false); }
      }}>{pending ? 'Removing…' : 'Remove object'}</button>
    </div>
  </dialog>;
}
