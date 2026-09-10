import React, { useEffect, useRef, useState } from "react";
import { playgroundRequest } from "./api";
import { exportIdentityBackup, type PlaygroundIdentity } from "./identity";
export function IdentityRecovery({
  name,
  onRestored,
}: {
  name: string;
  onRestored: () => void;
}) {
  const [identity, setIdentity] = useState<PlaygroundIdentity | null>(),
    [code, setCode] = useState(""),
    [restoreCode, setRestoreCode] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const alive = useRef(true),
    working = useRef(false);
  useEffect(() => {
    alive.current = true;
    void playgroundRequest<PlaygroundIdentity | null>(
      "/api/playground/identity",
    )
      .then((value) => {
        if (alive.current) setIdentity(value);
      })
      .catch(() => {
        if (alive.current)
          setError("Identity backup is unavailable in this environment.");
      });
    return () => {
      alive.current = false;
    };
  }, []);
  async function reveal() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await exportIdentityBackup(name);
      if (alive.current) {
        setIdentity(result.identity);
        setCode(result.recoveryCode);
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Unable to export a recovery code.",
        );
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function restore() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await playgroundRequest("/api/playground/identity/restore", {
        recoveryCode: restoreCode.trim(),
      });
      if (alive.current) {
        setRestoreCode("");
        setCode("");
        onRestored();
      }
    } catch {
      if (alive.current)
        setError(
          "The identity could not be restored. Check your recovery code and try again.",
        );
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      if (alive.current)
        setNotice("Recovery code copied. Keep it somewhere private.");
    } catch {
      if (alive.current)
        setError(
          "Clipboard unavailable. Select and copy the revealed code, or download it.",
        );
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([code + "\n"], { type: "text/plain" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "agartha-identity-recovery.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Recovery download requested. Check that you have saved the file.",
    );
  }
  return (
    <section>
      <h4>Your identity & recovery</h4>
      <p className="panel-hint">
        Your identity owns your contributions and credits. Before funding
        compute, reveal a backup and keep it privately. Anyone with the code
        can restore this identity.
      </p>
      {identity && (
        <p className="playground-meta">Signed in as {identity.name}</p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {identity && !identity.recoverable && (
        <p className="panel-hint">
          This identity needs its existing recovery code. Restore it below; a
          new backup won’t replace it.
        </p>
      )}
      {!code ? (
        <button
          disabled={busy || (!!identity && !identity.recoverable)}
          onClick={() => void reveal()}
        >
          Back up identity
        </button>
      ) : (
        <div>
          <label>
            Recovery code
            <textarea
              value={code}
              readOnly
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <div className="playground-actions">
            <button onClick={() => void copy()}>Copy recovery code</button>
            <button onClick={download}>Download backup</button>
            <button onClick={() => setCode("")}>Hide recovery code</button>
          </div>
        </div>
      )}
      <details>
        <summary>Restore identity</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void restore();
          }}
        >
          <label>
            Existing recovery code
            <input
              type="password"
              value={restoreCode}
              onChange={(e) => setRestoreCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <p className="panel-hint">
            Restoring switches this browser to the saved identity and reloads
            the playground. Save any unfinished drafts first.
          </p>
          <button disabled={busy || !restoreCode.trim()}>
            Restore saved identity
          </button>
        </form>
      </details>
    </section>
  );
}
