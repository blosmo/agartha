import React, { useEffect, useRef, useState } from "react";
import type { PlaygroundFunding } from "../../../../../packages/protocol/src/playgroundFunding";
import { ensurePlaygroundSession } from "./identity";
import { playgroundRequest, PlaygroundRequestError } from "./api";
export type PaymentAction = {
  path: string;
  body: Record<string, unknown>;
  label: string;
};
const uncertainActions = new Map<string, PaymentAction>();
export function useFundingResource<T>(path: string, name: string) {
  const [value, setValue] = useState<T>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  const [pending, setPending] = useState(() => uncertainActions.get(path));
  const alive = useRef(true),
    version = useRef(0),
    writing = useRef(false);
  async function refresh() {
    const serial = ++version.current;
    try {
      const next = await playgroundRequest<T>(path);
      if (alive.current && serial === version.current) setValue(next);
    } catch (e) {
      if (alive.current && serial === version.current)
        setError(e instanceof Error ? e.message : "Unable to load funding.");
    } finally {
      if (alive.current && serial === version.current) setLoading(false);
    }
  }
  async function resolveStart(jobId: string) {
    if (writing.current) return false;
    const pendingStart = uncertainActions.get(path);
    if (pendingStart?.path !== `${path}/start`) return false;
    setBusy(true);
    writing.current = true;
    try {
      const confirmed = await playgroundRequest<PlaygroundFunding>(path);
      if (
        uncertainActions.get(path) !== pendingStart ||
        confirmed.jobId !== jobId ||
        path !== `/api/playground/projects/${confirmed.projectId}/funding` ||
        !["building", "settled"].includes(confirmed.status) ||
        !confirmed.job ||
        ![
          "queued",
          "running",
          "completed",
          "partial",
          "failed",
          "cancelled",
        ].includes(confirmed.job.status) ||
        confirmed.livemode !== pendingStart.body.livemode
      )
        throw new Error(
          "The build state could not be reconciled. Retry the original request.",
        );
      uncertainActions.delete(path);
      if (alive.current) {
        setValue(confirmed as T);
        setPending(undefined);
        setError("");
        setNotice(
          "The existing build is confirmed. You can cancel active work or settle a stopped job without starting another.",
        );
      }
      return true;
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Unable to reconcile the build.",
        );
      return false;
    } finally {
      writing.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function run(action: PaymentAction, retry = false) {
    if (writing.current || (uncertainActions.has(path) && !retry)) return false;
    writing.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let sent = false;
    const next = retry
      ? uncertainActions.get(path)!
      : { ...action, body: { ...action.body, requestId: crypto.randomUUID() } };
    try {
      await ensurePlaygroundSession(name);
      uncertainActions.set(path, next);
      if (alive.current) setPending(next);
      sent = true;
      await playgroundRequest(next.path, next.body);
      uncertainActions.delete(path);
      if (alive.current) {
        setPending(undefined);
        setNotice("Confirmed. Your balance has been updated.");
        await refresh();
      }
      return true;
    } catch (e) {
      if (
        sent &&
        e instanceof PlaygroundRequestError &&
        e.status >= 400 &&
        e.status < 500 &&
        ![408, 429].includes(e.status)
      )
        uncertainActions.delete(path);
      if (alive.current) {
        setPending(uncertainActions.get(path));
        setError(
          uncertainActions.has(path)
            ? "This payment action is not confirmed. Retry the same request to check its result safely."
            : e instanceof Error
              ? e.message
              : "Unable to complete this action.",
        );
      }
      return false;
    } finally {
      writing.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      ++version.current;
    };
  }, [path]);
  return {
    value,
    error,
    busy,
    loading,
    notice,
    pending,
    refresh,
    run,
    resolveStart,
  };
}
export function FundingMessages({
  state,
}: {
  state: {
    error: string;
    notice: string;
    pending?: PaymentAction;
    busy: boolean;
    run: (action: PaymentAction, retry?: boolean) => Promise<boolean>;
  };
}) {
  return (
    <>
      {state.error && <p role="alert">{state.error}</p>}
      {state.notice && (
        <p role="status" className="playground-notice">
          {state.notice}
        </p>
      )}
      {state.pending && (
        <button
          disabled={state.busy}
          onClick={() => void state.run(state.pending!, true)}
        >
          Check unconfirmed payment action
        </button>
      )}
    </>
  );
}
