import React, { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import {
  GOVERNANCE_SHAPES,
  type GovernanceScope,
  type GovernanceStatus,
} from "../../../../../packages/protocol/src/governance";
import { useGovernance } from "./useGovernance";
const ruleLabels: Record<string,string> = {charter:"Charter",allowedShapes:"Allowed shapes",maxObjectScale:"Maximum object scale"};
const labels: Record<GovernanceStatus, string> = {
  draft: "Draft",
  open: "Voting open",
  active: "Active",
  implementation_pending: "Awaiting implementation",
  rejected: "Rejected",
  superseded: "Superseded",
  withdrawn: "Withdrawn",
};
export function GovernancePanel({
  roomId,
  cloud,
  onClose,
}: {
  roomId: string;
  cloud: boolean;
  onClose: () => void;
}) {
  const [software, setSoftware] = useState(false);
  const scope: GovernanceScope = software ? "software" : `world:${roomId}`;
  return (
    <aside
      id="governance-panel"
      className="room-browser governance-panel"
      aria-label="Rules"
    >
      <div className="room-panel-heading">
        <h2>Rules</h2>
        <button aria-label="Close rules" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {!cloud ? (
        <p className="panel-hint">
          Rules and voting are available in the hosted version of Agartha. This
          local world does not support governance.
        </p>
      ) : (
        <>
          <div className="governance-actions" aria-label="Rules scope">
            <button aria-pressed={!software} onClick={() => setSoftware(false)}>
              This world
            </button>
            <button aria-pressed={software} onClick={() => setSoftware(true)}>
              Agartha software
            </button>
          </div>
          <ScopePanel key={scope} scope={scope} />
        </>
      )}
    </aside>
  );
}
function ScopePanel({ scope }: { scope: GovernanceScope }) {
  const state = useGovernance(scope),
    view = state.overview,
    proposal = state.selected;
  const [title, setTitle] = useState(""),
    [rationale, setRationale] = useState(""),
    [charter, setCharter] = useState(""),
    [scale, setScale] = useState(""),
    [shapes, setShapes] = useState<string[]>([]);
  const [rule, setRule] = useState(""),
    [implementation, setImplementation] = useState(""),
    [criteria, setCriteria] = useState(""),
    [comment, setComment] = useState(""),
    [voter, setVoter] = useState("");
  const [hours, setHours] = useState("24");
  const [editing, setEditing] = useState<{ id: string; revision: number }>();
  const [changeCharter, setChangeCharter] = useState(false);
  const detailsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!proposal?.id) return;
    detailsRef.current?.focus({preventScroll:true});
    detailsRef.current?.scrollIntoView?.({block:'start'});
  }, [proposal?.id]);
  useEffect(() => {
    setComment("");
  }, [proposal?.id]);
  useEffect(() => {
    if (!state.success) return;
    if (state.success.path.endsWith("/comments")) setComment("");
    if (state.success.path === "/api/governance/proposals") {
      setTitle("");
      setRationale("");
      setCharter("");
      setChangeCharter(false);
      setScale("");
      setShapes([]);
      setRule("");
      setImplementation("");
      setCriteria("");
    }
    if (
      editing &&
      state.success.path ===
        `/api/governance/proposals/${encodeURIComponent(editing.id)}`
    )
      setEditing(undefined);
  }, [state.success]);
  function action(name: string, extra: Record<string, unknown> = {}) {
    if (proposal)
      void state.mutate(
        `/api/governance/proposals/${encodeURIComponent(proposal.id)}/${name}`,
        { expectedRevision: proposal.revision, ...extra },
      );
  }
  return (
    <>
      {(state.error || (state.pending && !state.busy)) && (
        <div role="alert">
          <p>
            {state.error ||
              "This request has not been confirmed. Retry to check its result."}
          </p>
          {state.pending ? (
            <button disabled={state.busy} onClick={() => void state.retry()}>
              Retry request
            </button>
          ) : (
            <button onClick={() => void state.refresh()}>Refresh rules</button>
          )}
        </div>
      )}
      {state.busy && <p role="status">Saving…</p>}
      {!view ? (
        <p role="status">Loading rules…</p>
      ) : (
        <>
          <section>
            <div className="governance-actions">
              <h3>Current rules</h3>
              <button
                disabled={state.blocked}
                onClick={() => {
                  void state.refresh();
                  if (proposal) void state.openProposal(proposal.id);
                }}
              >
                Refresh
              </button>
            </div>
            {view.rules ? (
              <>
                <p>{view.rules.charter || "No charter set."}</p>
                <p className="panel-hint">
                  Shapes: {view.rules.allowedShapes.join(", ")} · Maximum scale:{" "}
                  {view.rules.maxObjectScale}
                </p>
              </>
            ) : (
              <p className="panel-hint">
                Software changes await implementation and review after passing.
                Votes do not deploy code.
              </p>
            )}
            <p className="panel-hint">
              {view.permissions.eligibleToVote
                ? "You are on this voter roster."
                : "You are not on this voter roster. Registration does not grant a vote."}{" "}
              {view.voting.rosterReady
                ? "Each vote freezes its voter roster."
                : "A voter roster must be configured before voting can open."}
            </p>
            <p className="panel-hint">
              Quorum: half the roster, rounded up. More yes than no votes are
              required; abstentions count toward quorum.
            </p>
          </section>
          {view.permissions.canManageVoters && scope !== "software" && (
            <details>
              <summary>World voters ({view.voters.length})</summary>
              <fieldset disabled={state.blocked}>
                {view.voters.map((person) => (
                  <div className="governance-actions" key={person.agentId}>
                    <span>{person.name}</span>
                    <button
                      onClick={() =>
                        void state.mutate("/api/governance/voters", {
                          scope,
                          expectedVersion: view.voterVersion,
                          agentId: person.agentId,
                          enabled: false,
                        })
                      }
                    >
                      Remove {person.name}
                    </button>
                  </div>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void state.mutate("/api/governance/voters", {
                      scope,
                      expectedVersion: view.voterVersion,
                      agentId: voter,
                      enabled: true,
                    });
                  }}
                >
                  <label>
                    Registered agent ID
                    <input
                      required
                      value={voter}
                      onChange={(e) => setVoter(e.target.value)}
                    />
                  </label>
                  <button>Add voter</button>
                </form>
              </fieldset>
            </details>
          )}
          {view.permissions.canPropose && (
            <details open={editing ? true : undefined}>
              <summary>{editing ? "Edit draft" : "Propose a change"}</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const change =
                    scope === "software"
                      ? {
                          kind: "software",
                          rule,
                          implementation,
                          acceptanceCriteria: criteria
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }
                      : {
                          kind: "world_rules",
                          rules: {
                            ...(changeCharter ? { charter } : {}),
                            ...(scale ? { maxObjectScale: Number(scale) } : {}),
                            ...(shapes.length ? { allowedShapes: shapes } : {}),
                          },
                        };
                  void state.mutate(
                    editing
                      ? `/api/governance/proposals/${encodeURIComponent(editing.id)}`
                      : "/api/governance/proposals",
                    editing
                      ? {
                          expectedRevision: editing.revision,
                          title,
                          rationale,
                          change,
                        }
                      : { scope, title, rationale, change },
                  );
                }}
              >
                <fieldset disabled={state.blocked}>
                  <label>
                    Title
                    <input
                      required
                      maxLength={160}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    Rationale
                    <textarea
                      required
                      maxLength={2400}
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                    />
                  </label>
                  {scope === "software" ? (
                    <>
                      <label>
                        Proposed software rule
                        <textarea
                          required
                          maxLength={1200}
                          value={rule}
                          onChange={(e) => setRule(e.target.value)}
                        />
                      </label>
                      <label>
                        Implementation
                        <textarea
                          required
                          maxLength={6000}
                          value={implementation}
                          onChange={(e) => setImplementation(e.target.value)}
                        />
                      </label>
                      <label>
                        Acceptance criteria, one per line
                        <textarea
                          required
                          maxLength={5009}
                          value={criteria}
                          onChange={(e) => {
                            const items = e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            e.target.setCustomValidity(
                              items.length > 10 ||
                                items.some((s) => s.length > 500)
                                ? "Use up to 10 criteria, each at most 500 characters."
                                : "",
                            );
                            setCriteria(e.target.value);
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Charter
                        <textarea
                          maxLength={1200}
                          value={charter}
                          onChange={(e) => {
                            setCharter(e.target.value);
                            setChangeCharter(true);
                          }}
                        />
                      </label>
                      <label>
                        Maximum object scale
                        <input
                          type="number"
                          min="0.1"
                          max="60"
                          step="any"
                          value={scale}
                          onChange={(e) => setScale(e.target.value)}
                        />
                      </label>
                      <fieldset>
                        <legend>
                          Allowed shapes (leave unchanged if none selected)
                        </legend>
                        {GOVERNANCE_SHAPES.map((shape) => (
                          <label className="governance-checkbox" key={shape}>
                            <input
                              type="checkbox"
                              checked={shapes.includes(shape)}
                              onChange={(e) =>
                                setShapes((old) =>
                                  e.target.checked
                                    ? [...old, shape]
                                    : old.filter((s) => s !== shape),
                                )
                              }
                            />
                            {shape}
                          </label>
                        ))}
                      </fieldset>
                    </>
                  )}
                  <button>{editing ? "Save draft" : "Create draft"}</button>
                  {editing && (
                    <button type="button" onClick={() => setEditing(undefined)}>
                      New proposal
                    </button>
                  )}
                </fieldset>
              </form>
            </details>
          )}
          <section>
            <h3>
              {scope === "software" ? "Software proposals" : "World proposals"}
            </h3>
            {!state.proposals.length && (
              <p className="panel-hint">No proposals yet.</p>
            )}
            {state.proposals.map((item) => (
              <button
                className="governance-proposal"
                disabled={state.blocked}
                key={item.id}
                onClick={() => void state.openProposal(item.id)}
                aria-pressed={proposal?.id === item.id}
              >
                {item.title}
                <small>{labels[item.status]}</small>
              </button>
            ))}
            {state.cursor && (
              <button
                disabled={state.loadingMore}
                onClick={() => void state.more()}
              >
                More proposals
              </button>
            )}
          </section>
          {proposal && (
            <section aria-label="Proposal detail" ref={detailsRef} tabIndex={-1}>
              <h3>{proposal.title}</h3>
              <p>{labels[proposal.status]}</p>
              <p>{proposal.rationale}</p>
              {proposal.change.kind === "world_rules" ? (
                <dl>
                  {Object.entries(proposal.change.rules).map(([key, value]) => (
                    <React.Fragment key={key}>
                      <dt>{ruleLabels[key] ?? key}</dt>
                      <dd>
                        {Array.isArray(value)
                          ? value.join(", ")
                          : String(value)}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              ) : (
                <>
                  <p>{proposal.change.rule}</p>
                  <p>{proposal.change.implementation}</p>
                  <ul>
                    {proposal.change.acceptanceCriteria.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="panel-hint">
                {proposal.tally.yes} yes · {proposal.tally.no} no ·{" "}
                {proposal.tally.abstain} abstain · Quorum {proposal.tally.total}
                /{proposal.tally.quorum}
              </p>
              {proposal.closesAt && (
                <p className="panel-hint">
                  Closes {new Date(proposal.closesAt).toLocaleString()}
                </p>
              )}
              {proposal.outcomeReason && <p>{proposal.outcomeReason}</p>}
              <fieldset disabled={state.blocked}>
                {proposal.permissions.canEdit && (
                  <button
                    onClick={() => {
                      setEditing({
                        id: proposal.id,
                        revision: proposal.revision,
                      });
                      setTitle(proposal.title);
                      setRationale(proposal.rationale);
                      if (proposal.change.kind === "world_rules") {
                        setCharter(proposal.change.rules.charter ?? "");
                        setChangeCharter(
                          proposal.change.rules.charter !== undefined,
                        );
                        setScale(
                          proposal.change.rules.maxObjectScale?.toString() ??
                            "",
                        );
                        setShapes(proposal.change.rules.allowedShapes ?? []);
                      } else {
                        setRule(proposal.change.rule);
                        setImplementation(proposal.change.implementation);
                        setCriteria(
                          proposal.change.acceptanceCriteria.join("\n"),
                        );
                      }
                    }}
                  >
                    Edit draft
                  </button>
                )}
                {proposal.permissions.canOpen && (
                  <>
                    <label>
                      Voting duration (hours)
                      <input
                        type="number"
                        min="1"
                        max="168"
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                      />
                    </label>
                    <button
                      onClick={() =>
                        action("open", { votingHours: Number(hours) })
                      }
                    >
                      Open voting
                    </button>
                  </>
                )}
                {proposal.permissions.canVote && (
                  <div className="governance-actions">
                    {(["yes", "no", "abstain"] as const).map((choice) => (
                      <button
                        key={choice}
                        aria-pressed={
                          proposal.ballots.find(
                            (b) => b.agentId === view.permissions.agentId,
                          )?.choice === choice
                        }
                        onClick={() =>
                          action("vote", {
                            choice,
                            expectedBallotVersion:
                              proposal.ballots.find(
                                (b) => b.agentId === view.permissions.agentId,
                              )?.version ?? 0,
                          })
                        }
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                )}
                {proposal.permissions.canWithdraw && (
                  <button onClick={() => action("withdraw")}>
                    Withdraw proposal
                  </button>
                )}
                {proposal.permissions.canFinalize && (
                  <button onClick={() => action("finalize")}>
                    Finalize vote
                  </button>
                )}
              </fieldset>
              {proposal.implementation && (
                <details>
                  <summary>Implementation packet</summary>
                  <p>{proposal.implementation.rule}</p>
                  <p>{proposal.implementation.implementation}</p>
                  <ul>
                    {proposal.implementation.acceptanceCriteria.map(
                      (text, i) => (
                        <li key={i}>{text}</li>
                      ),
                    )}
                  </ul>
                  <p>{proposal.implementation.repository}</p>
                  <p className="panel-hint">
                    Awaiting implementation. This change is not deployed.
                  </p>
                </details>
              )}
              <h3>Discussion</h3>
              {state.comments.map((item) => (
                <p key={item.id}>
                  <strong>{item.author.name}</strong>: {item.text}
                </p>
              ))}
              {state.commentCursor && (
                <button
                  disabled={state.loadingComments}
                  onClick={() => void state.openProposal(proposal.id, true)}
                >
                  More comments
                </button>
              )}
              {view.permissions.canPropose && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void state.mutate(
                      `/api/governance/proposals/${encodeURIComponent(proposal.id)}/comments`,
                      { text: comment },
                    );
                  }}
                >
                  <fieldset disabled={state.blocked}>
                    <label>
                      Comment
                      <textarea
                        required
                        maxLength={2400}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </label>
                    <button>Post comment</button>
                  </fieldset>
                </form>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
