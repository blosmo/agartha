import {
  useFundingResource,
  FundingMessages,
  type PaymentAction,
} from "./useFundingResource";
import { AgentAllowance } from "./AgentAllowance";
import { IdentityRecovery } from "./IdentityRecovery";
import React, { useEffect, useState } from "react";
import type { PlaygroundProject } from "../../../../../packages/protocol/src/playground";
import type {
  PlaygroundFunding,
  PlaygroundPassOffer,
  PlaygroundPassReceipt,
} from "../../../../../packages/protocol/src/playgroundFunding";
import { CreditTopUp } from "./CreditTopUp";
import { playgroundRequest } from "./api";
import { Button } from "@/components/ui/button";
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
type PassView = {
  offer: PlaygroundPassOffer;
  pass: PlaygroundPassReceipt | null;
  wallet: { availableCents: number; heldCents: number; frozen: boolean } | null;
};
export function YourPass({
  name,
  onName,
  onInvite,
}: {
  name: string;
  onName: (name: string) => void;
  onInvite: () => void;
}) {
  const state = useFundingResource<PassView>("/api/playground/pass", name),
    [confirm, setConfirm] = useState(false);
  const data = state.value;
  return (
    <div>
      <h3>Optional build budget</h3>
      <p className="panel-hint">
        Keep creating for free. Add a one-time budget when a shared idea is
        ready for managed compute. Credits pay for hosting and generation; they
        do not buy membership, votes, or creative control.
      </p>
      <FundingMessages state={state} />
      {state.loading && <p role="status">Checking pass availability…</p>}
      {data && (
        <>
          <p className="playground-notice">
            {data.offer.livemode
              ? "Live prepaid credits"
              : "Test mode · no real-money purchase here"}
          </p>
          {data.pass ? (
            <section>
              <h4>Your build budget is active</h4>
              <p>
                Hosting contribution: {money(data.pass.feeCents)}. Generation
                allocation at activation: {money(data.pass.generationCents)}.
              </p>
              <p className="panel-hint">
                The generation allocation remains in your prepaid wallet and
                changes as you use it.
              </p>
              <Button variant="primary" onClick={onInvite}>
                Bring your agent into this build
              </Button>
            </section>
          ) : (
            <section>
              <h4>One-time build budget</h4>
              {data.offer.available && (
                <>
                  <dl>
                    <dt>Hosting fee</dt>
                    <dd>{money(data.offer.feeCents)}</dd>
                    <dt>Generation budget</dt>
                    <dd>{money(data.offer.generationCents)}</dd>
                    <dt>Prepaid balance required</dt>
                    <dd>{money(data.offer.totalCents)}</dd>
                  </dl>
                  <p className="panel-hint">
                    Adding a build budget deducts only the hosting fee. The
                    generation budget stays in your wallet. No automatic
                    top-ups.
                  </p>
                </>
              )}
              {!data.offer.available ? (
                <p className="panel-hint">
                  {data.offer.unavailableReason ||
                    "Paid passes are not enabled yet. Free participation remains open."}
                </p>
              ) : (
                <>
                  {!data.wallet && (
                    <label>
                      Your contributor name
                      <input
                        value={name}
                        maxLength={60}
                        onChange={(e) => onName(e.target.value)}
                        placeholder="Playground visitor"
                      />
                    </label>
                  )}
                  {!confirm ? (
                    <Button
                      variant="primary"
                      disabled={
                        state.busy || !!state.pending || !!data.wallet?.frozen
                      }
                      onClick={() => setConfirm(true)}
                    >
                      Review build budget
                    </Button>
                  ) : (
                    <div>
                      <p>
                        Add this {data.offer.livemode ? "live" : "test"}{" "}
                        build budget using your prepaid balance? This deducts{" "}
                        {money(data.offer.feeCents)} for hosting and leaves{" "}
                        {money(data.offer.generationCents)} available for
                        generation from the required{" "}
                        {money(data.offer.totalCents)} balance.
                      </p>
                      <div className="playground-actions">
                        <Button
                          variant="primary"
                          disabled={state.busy || !!state.pending}
                          onClick={async () => {
                            if (
                              await state.run({
                                path: "/api/playground/pass/activate",
                                body: {
                                  offerId: data.offer.offerId,
                                  livemode: data.offer.livemode,
                                },
                                label: "Add build budget",
                              })
                            )
                              setConfirm(false);
                          }}
                        >
                          Confirm build budget
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={state.busy}
                          onClick={() => setConfirm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          <section>
            <h4>Your build credits</h4>
            {data.wallet ? (
              <>
                <dl>
                  <dt>Available credits</dt>
                  <dd>{money(data.wallet.availableCents)}</dd>
                  <dt>Held for work</dt>
                  <dd>{money(data.wallet.heldCents)}</dd>
                </dl>
                {data.wallet.frozen && (
                  <p role="alert">
                    This wallet is frozen. Paid actions are unavailable.
                  </p>
                )}
              </>
            ) : (
              <p className="panel-hint">
                A prepaid wallet is only needed when you fund compute. No
                payment is collected by opening this panel, and the commons
                stays free.
              </p>
            )}
            <a
              href="/agents/blender-billing.md"
              target="_blank"
              rel="noreferrer"
            >
              Prepaid credits and generation guide ↗
            </a>
          </section>
        </>
      )}
      <AgentAllowance
        name={name}
        enabled={!!data?.pass}
        frozen={!!data?.wallet?.frozen}
        availableCents={data?.wallet?.availableCents ?? 0}
        livemode={data?.offer.livemode ?? false}
        onUpdated={() => void state.refresh()}
      />
      <IdentityRecovery
        name={name}
        onRestored={() => window.location.reload()}
      />
      <CreditTopUp name={name} onUpdated={() => void state.refresh()} />
      {state.error && (
        <button onClick={() => void state.refresh()}>
          Refresh pass details
        </button>
      )}
    </div>
  );
}
export function ProjectFunding({
  project,
  name,
}: {
  project: PlaygroundProject;
  name: string;
}) {
  const path = `/api/playground/projects/${project.projectId}/funding`,
    state = useFundingResource<PlaygroundFunding | null>(path, name);
  const [amount, setAmount] = useState(""),
    [confirmation, setConfirmation] = useState<PaymentAction>();
  const [offer, setOffer] = useState<PlaygroundPassOffer>();
  useEffect(() => {
    let alive = true;
    void playgroundRequest<PassView>("/api/playground/pass")
      .then((value) => {
        if (alive) setOffer(value.offer);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const funding = state.value;
  const cents = Math.round(Number(amount) * 100),
    validAmount =
      /^\d+(\.\d{1,2})?$/.test(amount) &&
      Number.isSafeInteger(cents) &&
      cents > 0;
  return (
    <section>
      <h4>Optional build budget</h4>
      <p className="panel-hint">
        Only add credits when this idea is ready to become a build. You can join
        with ideas, references, or an agent for free. A budget pays for compute
        and never buys creative control.
      </p>
      <FundingMessages state={state} />
      {state.pending && (
        <button disabled={state.busy} onClick={() => void state.refresh()}>
          Refresh funding state
        </button>
      )}
      {state.pending?.path === `${path}/start` &&
        funding?.jobId &&
        ["building", "settled"].includes(funding.status) &&
        funding.job &&
        [
          "queued",
          "running",
          "completed",
          "partial",
          "failed",
          "cancelled",
        ].includes(funding.job.status) && (
          <button
            disabled={state.busy}
            onClick={async () => {
              if (await state.resolveStart(funding.jobId!))
                setConfirmation(undefined);
            }}
          >
            Use confirmed build state
          </button>
        )}
      {state.loading ? (
        <p role="status">Checking shared budget…</p>
      ) : funding ? (
        <>
          <p className="playground-meta">
            {funding.livemode ? "Live credits" : "Test credits"} ·{" "}
            {funding.status}
          </p>
          <progress
            value={Math.min(funding.backedCents, funding.targetCents)}
            max={funding.targetCents || 1}
            aria-label="Shared build funding"
          />
          <p>
            {money(funding.backedCents)} backed of {money(funding.targetCents)}
          </p>
          <p className="panel-hint">
            The target includes {money(funding.feeCents)} for production and{" "}
            {money(funding.targetCents - funding.feeCents)} for generation.
          </p>
          {funding.status === "funding" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (validAmount)
                  setConfirmation({
                    path: `${path}/back`,
                    body: {
                      amountCents: cents,
                      livemode: funding.livemode,
                      expectedTargetCents: funding.targetCents,
                      expectedFeeCents: funding.feeCents,
                    },
                    label: `Allocate ${money(cents)} of your ${funding.livemode ? "live" : "test"} prepaid credits toward this ${money(funding.targetCents)} project, including its ${money(funding.feeCents)} production fee`,
                  });
              }}
            >
              <label>
                Credits to contribute (USD)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <button disabled={!validAmount || state.busy || !!state.pending}>
                Review contribution
              </button>
            </form>
          )}
          {funding.job && (
            <div>
              <p>
                Build: {funding.job.status} · {funding.job.progress}
              </p>
              {funding.job.artifactsReady && (
                <p className="panel-hint">
                  Build artifacts are ready
                  {funding.job.visuallyInspected
                    ? " and visually inspected"
                    : "; visual review is still needed"}
                  .
                </p>
              )}
              {funding.job.artifactsReady && funding.jobId &&
                (project.canManage ||
                  (!["queued", "running"].includes(funding.job.status) &&
                    funding.backers.some((backer) => backer.mine))) && (
                  <div className="playground-actions">
                    <a href={`/api/playground/jobs/${encodeURIComponent(funding.jobId)}/artifacts/preview.png`} target="_blank" rel="noopener noreferrer">View preview</a>
                    <a href={`/api/playground/jobs/${encodeURIComponent(funding.jobId)}/artifacts/model.glb`} download>Download model</a>
                    <a href={`/api/playground/jobs/${encodeURIComponent(funding.jobId)}/artifacts/model.blend`} download>Download Blender file</a>
                  </div>
                )}
              <button
                disabled={state.busy}
                onClick={() => void state.refresh()}
              >
                Refresh build status
              </button>
            </div>
          )}
          {project.canManage && (
            <div className="playground-actions">
              {funding.status === "funding" &&
                funding.backedCents >= funding.targetCents && (
                  <button
                    disabled={state.busy || !!state.pending}
                    onClick={() =>
                      setConfirmation({
                        path: `${path}/start`,
                        body: { livemode: funding.livemode },
                        label: `Start paid generation for this brief with a maximum shared budget of ${money(funding.targetCents)}, including ${money(funding.feeCents)} for production and ${money(funding.targetCents - funding.feeCents)} for generation`,
                      })
                    }
                  >
                    Review build authorization
                  </button>
                )}
              {funding.status === "building" &&
                funding.job &&
                ["queued", "running"].includes(funding.job.status) && (
                  <button
                    disabled={state.busy || !!state.pending}
                    onClick={() =>
                      setConfirmation({
                        path: `${path}/cancel`,
                        body: { livemode: funding.livemode },
                        label:
                          "Request cancellation of this build. Work already performed may be charged; after the job stops, settle its budget to return unused credits to backers",
                      })
                    }
                  >
                    Cancel build
                  </button>
                )}
              {funding.status === "funding" && (
                <button
                  disabled={state.busy || !!state.pending}
                  onClick={() =>
                    setConfirmation({
                      path: `${path}/cancel`,
                      body: { livemode: funding.livemode },
                      label:
                        "Cancel this funding pool and return all held backing to its contributors",
                    })
                  }
                >
                  Cancel funding pool
                </button>
              )}
              {funding.status === "building" &&
                funding.job &&
                ["completed", "partial", "failed", "cancelled"].includes(
                  funding.job.status,
                ) && (
                  <button
                    disabled={state.busy || !!state.pending}
                    onClick={() =>
                      setConfirmation({
                        path: `${path}/settle`,
                        body: { livemode: funding.livemode },
                        label:
                          "Settle actual generation charges for this stopped job and return unused credits proportionally to backers. The production fee applies to completed or partial work and is returned for failed or cancelled work",
                      })
                    }
                  >
                    Settle build budget
                  </button>
                )}
            </div>
          )}
          <details>
            <summary>Financial backers ({funding.backers.length})</summary>
            <ul>
              {funding.backers.map((backer) => (
                <li key={backer.backingId}>
                  <strong>{backer.contributorName}</strong>
                  <p>
                    {money(backer.amountCents)} · {backer.status}
                    {backer.refundedCents > 0
                      ? ` · ${money(backer.refundedCents)} returned`
                      : ""}
                  </p>
                  {backer.mine &&
                    backer.status === "held" &&
                    funding.status === "funding" && (
                      <button
                        disabled={state.busy || !!state.pending}
                        onClick={() =>
                          setConfirmation({
                            path: `${path}/withdraw`,
                            body: {
                              backingId: backer.backingId,
                              livemode: funding.livemode,
                            },
                            label: `Withdraw your ${money(backer.amountCents)} backing and return it to your prepaid balance`,
                          })
                        }
                      >
                        Withdraw backing
                      </button>
                    )}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        !state.error && (
          <>
            <p className="panel-hint">
              No build budget yet. Ideas and contributions are welcome without
              one.
            </p>
            {project.canManage &&
              !["completed", "cancelled"].includes(project.status) && (
                <details>
                  <summary>Set a shared build budget</summary>
                  <p className="panel-hint">
                    Set a budget for a complete base build. Production fees and
                    paid availability are checked before a pool is created. This
                    creates a {offer?.livemode ? "live" : "test"}-credit pool.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (validAmount)
                        setConfirmation({
                          path: `${path}/configure`,
                          body: {
                            targetCents: cents,
                            livemode: offer?.livemode ?? false,
                          },
                          label: `Set a ${money(cents)} shared build budget in ${offer?.livemode ? "live" : "test"} credits`,
                        });
                    }}
                  >
                    <label>
                      Total target (USD)
                      <input
                        type="number"
                        inputMode="decimal"
                        required
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={
                        !validAmount || !offer || state.busy || !!state.pending
                      }
                    >
                      Review target
                    </button>
                  </form>
                </details>
              )}
          </>
        )
      )}
      {confirmation && (
        <div role="group" aria-label="Confirm funding action">
          <p>{confirmation.label}?</p>
          <p className="panel-hint">
            This uses prepaid credits only. It does not charge a card or enable
            automatic top-ups.
          </p>
          <div className="playground-actions">
            <button
              disabled={state.busy || !!state.pending}
              onClick={async () => {
                if (await state.run(confirmation)) {
                  setConfirmation(undefined);
                  setAmount("");
                }
              }}
            >
              Confirm
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
    </section>
  );
}
