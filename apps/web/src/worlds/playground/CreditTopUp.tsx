import { ensurePlaygroundSession, requireExportedIdentity } from "./identity";
import React, { useEffect, useRef, useState } from "react";
import { playgroundRequest } from "./api";
type Pricing = {
  topUpCents: number[];
  purchasesEnabled: boolean;
  paymentMode: "test" | "live" | "unconfigured";
};
type Checkout = { paymentUrl: string; confirmationUrl?: string };
type Purchase = { status: string };
type Attempt = { purchaseId: string; requestId: string; amountCents: number };
// Keep the same purchase identity when recovering an interrupted checkout request.
let activeAttempt: Attempt | undefined;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export function CreditTopUp({
  name,
  onUpdated,
}: {
  name: string;
  onUpdated: () => void;
}) {
  const [pricing, setPricing] = useState<Pricing>(),
    [choice, setChoice] = useState<number>(),
    [attempt, setAttempt] = useState(activeAttempt),
    [checkout, setCheckout] = useState<Checkout>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const alive = useRef(true),
    writing = useRef(false);
  useEffect(() => {
    alive.current = true;
    void playgroundRequest<Pricing>("/api/playground/credit-pricing")
      .then((value) => {
        if (alive.current) setPricing(value);
      })
      .catch(() => {
        if (alive.current)
          setError("Credit purchases are unavailable right now.");
      });
    return () => {
      alive.current = false;
    };
  }, []);
  async function prepare(amount: number) {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError("");
    const next = activeAttempt ?? {
      amountCents: amount,
      purchaseId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    };
    try {
      await ensurePlaygroundSession(name);
      await requireExportedIdentity();
      activeAttempt = next;
      if (alive.current) setAttempt(next);
      await playgroundRequest("/api/playground/credits", {
        ...next,
        paymentRail: "checkout",
      });
      const result = await playgroundRequest<Checkout>(
        `/api/playground/credits/${next.purchaseId}/checkout`,
        {},
      );
      const url = new URL(result.paymentUrl, window.location.origin);
      if (url.protocol !== "https:" && url.origin !== window.location.origin)
        throw new Error("Checkout did not return a secure payment link.");
      if (alive.current) {
        setCheckout({ ...result, paymentUrl: url.href });
        setChoice(undefined);
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Unable to prepare checkout. Retry to recover this same purchase.",
        );
    } finally {
      writing.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function check() {
    if (!activeAttempt || writing.current) return;
    writing.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await playgroundRequest<Purchase>(
        `/api/playground/credits/${activeAttempt.purchaseId}`,
      );
      if (alive.current) {
        setStatus(`Payment status: ${result.status}.`);
        onUpdated();
      }
      if (
        [
          "paid",
          "canceled",
          "expired",
          "refunded",
          "failed",
          "disputed",
          "reversed",
        ].includes(result.status)
      ) {
        activeAttempt = undefined;
        if (alive.current) {
          setAttempt(undefined);
          setCheckout(undefined);
        }
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Unable to confirm this payment.",
        );
    } finally {
      writing.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section>
      <h4>Add build credits</h4>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {pricing &&
      (!pricing.purchasesEnabled || pricing.paymentMode === "unconfigured") ? (
        <p className="panel-hint">
          Build-credit checkout isn’t enabled here. Exploring and contributing
          ideas remain free.
        </p>
      ) : (
        pricing && (
          <>
            <p className="panel-hint">
              {pricing.paymentMode === "test"
                ? "Test checkout · use test payment details only."
                : "Live checkout · a one-time credit purchase."}{" "}
              No subscription or automatic top-ups.
            </p>
            {!attempt && (
              <div className="playground-actions">
                {pricing.topUpCents.map((amount) => (
                  <button
                    key={amount}
                    disabled={busy}
                    onClick={() => setChoice(amount)}
                  >
                    Add {money(amount)}
                  </button>
                ))}
              </div>
            )}
            {choice !== undefined && !attempt && (
              <div>
                <p>
                  Continue to {pricing.paymentMode} checkout for {money(choice)}{" "}
                  in prepaid generation credits?
                </p>
                <div className="playground-actions">
                  <button disabled={busy} onClick={() => void prepare(choice)}>
                    Prepare checkout
                  </button>
                  <button disabled={busy} onClick={() => setChoice(undefined)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )
      )}
      {attempt && (
        <div>
          <p className="panel-hint">
            One {money(attempt.amountCents)} purchase is pending. Its status
            must be confirmed before another purchase.
          </p>
          {checkout ? (
            <a href={checkout.paymentUrl} target="_blank" rel="noreferrer">
              Open secure checkout ↗
            </a>
          ) : (
            <button
              disabled={busy}
              onClick={() => void prepare(attempt.amountCents)}
            >
              Recover checkout link
            </button>
          )}
          <div className="playground-actions">
            <button disabled={busy} onClick={() => void check()}>
              Check payment status
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
