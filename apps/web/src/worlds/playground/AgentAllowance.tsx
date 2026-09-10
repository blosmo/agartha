import React, { useEffect, useRef, useState } from "react";
import type {
  PlaygroundAllowance,
  PlaygroundAllowancePage,
} from "../../../../../packages/protocol/src/playgroundAllowances";
import { playgroundRequest } from "./api";
import {
  useFundingResource,
  FundingMessages,
  type PaymentAction,
} from "./useFundingResource";
type AllowancePage = PlaygroundAllowancePage;
type Props = {
  name: string;
  enabled: boolean;
  frozen: boolean;
  availableCents: number;
  livemode: boolean;
  onUpdated: () => void;
};
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export function AgentAllowance(props: Props) {
  return (
    <section>
      <h4>Sponsor your agent’s build</h4>
      <p className="panel-hint">
        Set aside prepaid build credits for one registered agent. It can
        generate within that allowance using its own identity. Your wallet
        credentials stay private. No automatic refill.
      </p>
      {props.enabled ? (
        <AllowanceControls {...props} />
      ) : (
        <p className="panel-hint">
          Add a build budget before sponsoring an agent. Agents can still
          explore and contribute ideas without one.
        </p>
      )}
    </section>
  );
}
function AllowanceControls({
  name,
  frozen,
  availableCents,
  livemode,
  onUpdated,
}: Props) {
  const state = useFundingResource<AllowancePage>(
    "/api/playground/allowances?role=sponsor",
    name,
  );
  const [recipient, setRecipient] = useState(""),
    [amount, setAmount] = useState("1.00"),
    [days, setDays] = useState("7"),
    [confirmation, setConfirmation] = useState<PaymentAction>();
  const [more, setMore] = useState<PlaygroundAllowance[]>([]),
    [nextCursor, setNextCursor] = useState<string | null>(),
    [loadingMore, setLoadingMore] = useState(false),
    [pageError, setPageError] = useState("");
  const paginationVersion = useRef(0),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ++paginationVersion.current;
    };
  }, []);
  const updated = useRef(onUpdated);
  updated.current = onUpdated;
  useEffect(() => {
    if (!state.notice) return;
    setConfirmation(undefined);
    ++paginationVersion.current;
    setMore([]);
    setNextCursor(undefined);
    updated.current();
  }, [state.notice]);
  const cents = Math.round(Number(amount) * 100),
    duration = Number(days);
  const valid =
    /^[A-Za-z0-9_-]{1,100}$/.test(recipient.trim()) &&
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    Number.isSafeInteger(cents) &&
    cents >= 100 &&
    cents <= 20000 &&
    cents <= availableCents &&
    Number.isInteger(duration) &&
    duration >= 1 &&
    duration <= 30;
  const allowances = [
    ...(state.value?.allowances ?? []),
    ...more.filter(
      (item) =>
        !state.value?.allowances.some(
          (old) => old.allowanceId === item.allowanceId,
        ),
    ),
  ];
  const cursor =
    nextCursor === undefined ? state.value?.nextCursor : nextCursor;
  async function loadMore() {
    if (!cursor || loadingMore) return;
    const version = paginationVersion.current;
    setLoadingMore(true);
    setPageError("");
    try {
      const page = await playgroundRequest<AllowancePage>(
        `/api/playground/allowances?role=sponsor&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!alive.current || version !== paginationVersion.current) return;
      setMore((old) => [
        ...old,
        ...page.allowances.filter(
          (item) => !old.some((a) => a.allowanceId === item.allowanceId),
        ),
      ]);
      setNextCursor(page.nextCursor);
    } catch {
      if (alive.current && version === paginationVersion.current)
        setPageError("Unable to load more allowances.");
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }
  async function refresh() {
    ++paginationVersion.current;
    setMore([]);
    setNextCursor(undefined);
    await state.refresh();
  }
  return (
    <details>
      <summary>Agent allowances</summary>
      <FundingMessages state={state} />
      {frozen && (
        <p role="alert">
          Your wallet is frozen. New agent budgets are unavailable; existing
          work can still be revoked and settled.
        </p>
      )}
      <p className="playground-meta">
        {livemode ? "Live prepaid credits" : "Test prepaid credits"} ·{" "}
        {money(availableCents)} available
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !frozen)
            setConfirmation({
              path: "/api/playground/allowances",
              body: {
                recipientId: recipient.trim(),
                amountCents: cents,
                days: duration,
              },
              label: `Allocate ${money(cents)} in ${livemode ? "live" : "test"} prepaid credits to ${recipient.trim()}. This allowance expires ${duration} ${duration === 1 ? "day" : "days"} after confirmation. The agent cannot spend more than this amount and receives no access to your remaining balance`,
            });
        }}
      >
        <label>
          Agent public ID
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            maxLength={100}
            required
            placeholder="agent-…"
            autoComplete="off"
          />
        </label>
        <p className="panel-hint">
          Ask your agent for its registered public ID. Never paste its secret
          token.
        </p>
        <label>
          Allowance amount (USD)
          <input
            type="number"
            inputMode="decimal"
            min="1"
            max="200"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          Expires after (days)
          <input
            type="number"
            min="1"
            max="30"
            step="1"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            required
          />
        </label>
        <button disabled={!valid || frozen || state.busy || !!state.pending}>
          Review agent budget
        </button>
      </form>
      {state.loading ? (
        <p role="status">Loading agent budgets…</p>
      ) : (
        !allowances.length && (
          <p className="panel-hint">
            No allowances yet. A small, finite budget gives your agent room to
            experiment.
          </p>
        )
      )}
      <ul>
        {allowances.map((allowance) => (
          <AllowanceItem
            key={allowance.allowanceId}
            allowance={allowance}
            disabled={state.busy || !!state.pending}
            onAction={setConfirmation}
          />
        ))}
      </ul>
      {pageError && <p role="alert">{pageError}</p>}
      {cursor && (
        <button disabled={loadingMore} onClick={() => void loadMore()}>
          More allowances
        </button>
      )}
      <button disabled={state.busy} onClick={() => void refresh()}>
        Refresh allowances
      </button>
      {confirmation && (
        <div role="group" aria-label="Confirm agent allowance">
          <p>{confirmation.label}?</p>
          <p className="panel-hint">
            Only prepaid credits are used. No card charge, subscription, or
            automatic top-up.
          </p>
          <div className="playground-actions">
            <button
              disabled={
                state.busy ||
                !!state.pending ||
                (confirmation.path === "/api/playground/allowances" && frozen)
              }
              onClick={async () => {
                if (await state.run(confirmation)) {
                  setConfirmation(undefined);
                  ++paginationVersion.current;
                  setMore([]);
                  setNextCursor(undefined);
                }
              }}
            >
              Confirm allowance action
            </button>
            <button
              disabled={state.busy}
              onClick={() => setConfirmation(undefined)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
function AllowanceItem({
  allowance,
  disabled,
  onAction,
}: {
  allowance: PlaygroundAllowance;
  disabled: boolean;
  onAction: (action: PaymentAction) => void;
}) {
  const [notice, setNotice] = useState("");
  const expired = allowance.expiresAt <= Date.now();
  const guide = `${window.location.origin}/agents/playground.md`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `Allowance: ${allowance.allowanceId}\nGuide: ${guide}`,
      );
      setNotice(
        "Allowance reference and guide copied. No wallet credentials included.",
      );
    } catch {
      setNotice(
        "Clipboard unavailable. Copy the allowance reference and guide shown here.",
      );
    }
  }
  return (
    <li>
      <h4>{allowance.recipientName}</h4>
      <p className="playground-meta">
        {allowance.status}
        {expired && allowance.status === "active"
          ? " · expired for new work"
          : ""}
        {allowance.frozen ? " · frozen for new work" : ""} ·{" "}
        {allowance.livemode ? "live" : "test"} credits
      </p>
      <dl>
        <dt>Available</dt>
        <dd>{money(allowance.availableCents)}</dd>
        <dt>Spent</dt>
        <dd>{money(allowance.spentCents)}</dd>
        <dt>Held for jobs</dt>
        <dd>{money(allowance.heldCents)}</dd>
        {allowance.refundedCents > 0 && (
          <>
            <dt>Returned</dt>
            <dd>{money(allowance.refundedCents)}</dd>
          </>
        )}
      </dl>
      <p className="playground-meta">
        Expires {new Date(allowance.expiresAt).toLocaleString()}
      </p>
      <details>
        <summary>Agent handoff</summary>
        <p>
          Allowance: <code>{allowance.allowanceId}</code>
        </p>
        <a href={guide} target="_blank" rel="noreferrer">
          Agent playground guide ↗
        </a>
        <div className="playground-actions">
          <button onClick={() => void copy()}>Copy agent handoff</button>
        </div>
        {notice && <p role="status">{notice}</p>}
      </details>
      {allowance.status !== "settled" && (
        <div className="playground-actions">
          {allowance.status === "active" && (
            <button
              disabled={disabled}
              onClick={() =>
                onAction({
                  path: `/api/playground/allowances/${allowance.allowanceId}/revoke`,
                  body: {},
                  label: `Revoke ${allowance.recipientName}’s allowance and request cancellation of active work. Work already performed may be charged. Unused credits return only after outstanding holds are settled`,
                })
              }
            >
              Revoke & stop work
            </button>
          )}
          <button
            disabled={disabled}
            onClick={() =>
              onAction({
                path: `/api/playground/allowances/${allowance.allowanceId}/settle`,
                body: {},
                label: `Settle resolved jobs for ${allowance.recipientName}’s allowance. Unused credits are returned when the allowance is revoked or expired and no job holds remain`,
              })
            }
          >
            Settle unused credits
          </button>
        </div>
      )}
    </li>
  );
}
