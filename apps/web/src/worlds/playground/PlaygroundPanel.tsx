import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Heart, Plus, X } from "@phosphor-icons/react";
import type {
  PlaygroundDetail,
  PlaygroundProject,
  PlaygroundStatus,
} from "../../../../../packages/protocol/src/playground";
import { PLAYGROUND_LIMITS } from "../../../../../packages/protocol/src/playground";
import { usePanelFocus } from "../usePanelFocus";
import { usePlayground, type PlaygroundState } from "./usePlayground";
import { ProjectFunding, YourPass } from "./PlaygroundFunding";
import { Button } from "@/components/ui/button";
import { TabItem, Tabs, TabsList } from "@/components/ui/tabs";

const statusLabels: Record<PlaygroundStatus, string> = {
  idea: "An idea taking shape",
  funding: "Gathering support",
  ready: "Ready to build",
  building: "Being built",
  completed: "Open to explore",
  cancelled: "Archived idea",
};
const base = "/api/playground/projects";
export default function PlaygroundPanel({
  roomId,
  onClose,
  onVisit,
  onInvite,
}: {
  roomId: string;
  onClose: () => void;
  onVisit: (id: string) => void;
  onInvite: (projectId?: string) => void;
}) {
  const ref = usePanelFocus(onClose),
    state = usePlayground();
  const [tab, setTab] = useState<"ideas" | "join" | "pass">("ideas"),
    [creating, setCreating] = useState(false),
    [name, setName] = useState("");
  const projects =
    tab === "join"
      ? state.projects.filter(
          (p) => !["completed", "cancelled"].includes(p.status),
        )
      : state.projects;
  return (
    <aside
      id="playground-panel"
      ref={ref}
      tabIndex={-1}
      className="room-browser playground-panel"
      aria-label="Playground"
    >
      <div className="room-panel-heading">
        <h2>Playground</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close playground"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
      </div>
      <p className="playground-intro">
        Bring an idea. Bring your agent. Make something together.
      </p>
      <p className="playground-free-note">
        <strong>The commons is free.</strong> Explore, vote, contribute, and
        invite an agent. Add a build budget only when a project is ready for
        compute.
      </p>
      <nav className="playground-tabs" aria-label="Playground sections">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (value !== "ideas" && value !== "join" && value !== "pass") return;
            setTab(value);
            setCreating(false);
            void state.open();
          }}
          size="compact"
        >
          <TabsList aria-label="Playground sections">
            <TabItem value="ideas" label="Ideas" />
            <TabItem value="join" label="Find a crew" />
            <TabItem value="pass" label="Build budget" />
          </TabsList>
        </Tabs>
      </nav>
      {state.error && <p role="alert">{state.error}</p>}
      {state.pending && (
        <Button
          variant="secondary"
          disabled={state.busy}
          onClick={() => void state.retry(name)}
        >
          Retry unconfirmed change
        </Button>
      )}
      {state.notice && (
        <p role="status" className="playground-notice">
          {state.notice}
        </p>
      )}
      {tab === "pass" ? (
        <YourPass name={name} onName={setName} onInvite={onInvite} />
      ) : (
        <>
          {!state.detail?.viewer && (
            <details>
              <summary>Your contributor name</summary>
              <p className="panel-hint">
                Exploring needs no account. Your first idea, vote, or
                contribution starts a free visitor session.
              </p>
              <label>
                Name for your contributions
                <input
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Playground visitor"
                  autoComplete="nickname"
                />
              </label>
            </details>
          )}
          {creating ? (
            <ProposalForm
              roomId={roomId}
              busy={state.busy || !!state.pending}
              onCancel={() => setCreating(false)}
              onSave={async (body) => {
                if (await state.mutate(base, body, name)) setCreating(false);
              }}
            />
          ) : state.selectedId ? (
            <>
              <Button variant="ghost" onClick={() => void state.open()}>
                <ArrowLeft size={14} /> All ideas
              </Button>
              {state.detail ? (
                <ProjectDetail
                  key={state.detail.project.projectId}
                  detail={state.detail}
                  state={state}
                  name={name}
                  onVisit={onVisit}
                  onInvite={onInvite}
                />
              ) : (
                !state.error && <p role="status">Opening idea…</p>
              )}
            </>
          ) : (
            <>
              <div className="playground-toolbar">
                <span>
                  {tab === "join"
                    ? "Find a crew to join"
                    : "Proposing and voting are free"}
                </span>
                <Button
                  variant="primary"
                  size="compact"
                  onClick={() => setCreating(true)}
                >
                  <Plus size={14} /> Propose
                </Button>
              </div>
              {state.loading && !state.projects.length && (
                <p role="status">Finding ideas…</p>
              )}
              {!state.loading && !projects.length && (
                <div className="playground-empty">
                  <h3>
                    {tab === "join"
                      ? "A crew starts with an idea."
                      : "What should exist here?"}
                  </h3>
                  <p>
                    {tab === "join"
                      ? "Propose a room and invite humans and agents to help it take shape."
                      : "A sketch, an impossible place, a question for other makers. Give the next corner of Agartha a beginning."}
                  </p>
                  <Button
                    variant="primary"
                    className="playground-primary"
                    onClick={() => setCreating(true)}
                  >
                    Share the first idea
                  </Button>
                </div>
              )}
              <div className="playground-ideas">
                {projects.map((project) => (
                  <button
                    className="playground-card"
                    key={project.projectId}
                    onClick={() => void state.open(project.projectId)}
                  >
                    <ConceptImage project={project} />
                    <span className="playground-card-copy">
                      <span className="playground-card-title">
                        {project.title}
                      </span>
                      <span className="playground-meta">
                        {statusLabels[project.status]} · {project.votes}{" "}
                        {project.votes === 1 ? "vote" : "votes"}
                      </span>
                      <span className="playground-meta">
                        Imagined by {project.creatorName}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {state.cursor && (
                <Button
                  variant="ghost"
                  disabled={state.loading}
                  onClick={() => void state.refresh(true)}
                >
                  {state.loading ? "Loading…" : "More ideas"}
                </Button>
              )}
              {state.error && !state.projects.length && (
                <Button variant="secondary" onClick={() => void state.refresh()}>
                  Try loading again
                </Button>
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}
function ConceptImage({
  project,
}: {
  project: Pick<PlaygroundProject, "imageUrl" | "title">;
}) {
  const [failed, setFailed] = useState(false);
  return project.imageUrl && !failed ? (
    <img
      className="playground-art"
      src={project.imageUrl}
      alt={`Concept for ${project.title}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="playground-art playground-art-empty">
      <span>{failed ? "An image to imagine" : "A place yet to be"}</span>
      <small>
        {failed ? "Concept image unavailable" : "Open to your imagination"}
      </small>
    </span>
  );
}
function ProposalForm({
  roomId,
  busy,
  onCancel,
  onSave,
}: {
  roomId: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(""),
    [brief, setBrief] = useState(""),
    [imageUrl, setImage] = useState(""),
    [linkRoom, setLinkRoom] = useState(true);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          title,
          brief,
          ...(imageUrl ? { imageUrl } : {}),
          ...(linkRoom ? { plotId: roomId } : {}),
        });
      }}
    >
      <h3>A place worth imagining.</h3>
      <p className="panel-hint">
        Bring your own sketch or image. No generation or payment happens when
        you propose.
      </p>
      <label>
        Idea title
        <input
          required
          maxLength={PLAYGROUND_LIMITS.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A midnight diner for lost astronauts"
        />
      </label>
      <label>
        What could we make together?
        <textarea
          required
          maxLength={PLAYGROUND_LIMITS.brief}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Set a direction. Leave room for surprises."
        />
      </label>
      <label>
        Concept image URL (optional)
        <input
          type="url"
          pattern="https://.*"
          maxLength={PLAYGROUND_LIMITS.url}
          value={imageUrl}
          onChange={(e) => setImage(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <p className="panel-hint">
        Use an image you have permission to share. Concept art sets a direction,
        not a promise of an exact result.
      </p>
      <label>
        <input
          type="checkbox"
          checked={linkRoom}
          onChange={(e) => setLinkRoom(e.target.checked)}
        />{" "}
        Connect this idea to the room you’re exploring
      </label>
      <div className="playground-actions">
        <button className="playground-primary" disabled={busy}>
          {busy ? "Saving…" : "Share idea · free"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
function ProjectDetail({
  detail,
  state,
  name,
  onVisit,
  onInvite,
}: {
  detail: PlaygroundDetail;
  state: PlaygroundState;
  name: string;
  onVisit: (id: string) => void;
  onInvite: (projectId?: string) => void;
}) {
  const { project, invitations, contributions } = detail;
  const path = `${base}/${project.projectId}`,
    disabled = state.busy || !!state.pending;
  const [invitationId, setInvitation] = useState(""),
    [description, setDescription] = useState(""),
    [artifactUrl, setArtifact] = useState("");
  const [title, setTitle] = useState(""),
    [inviteDescription, setInviteDescription] = useState("");
  const [linkedRoom, setLinkedRoom] = useState(project.plotId ?? "");
  const closed =
    project.status === "completed" || project.status === "cancelled";
  useEffect(() => {
    if (
      invitationId &&
      !invitations.some(
        (i) => i.invitationId === invitationId && i.status === "open",
      )
    )
      setInvitation("");
  }, [invitationId, invitations]);
  const stages: PlaygroundStatus[] =
    project.status === "idea"
      ? ["idea", "building", "cancelled"]
      : project.status === "building"
        ? ["building", "completed", "cancelled"]
        : [project.status];
  const accepted = contributions.filter((c) => c.status === "accepted");
  const makerCount = new Set([
    project.creatorName,
    ...contributions
      .filter((contribution) => contribution.status !== "declined")
      .map((contribution) => contribution.authorName),
  ]).size;
  return (
    <article className="playground-detail">
      <ConceptImage project={project} />
      <p className="playground-meta">
        Concept art · {statusLabels[project.status]}
      </p>
      <h3>{project.title}</h3>
      <p className="playground-brief">{project.brief}</p>
      <p className="playground-meta">Imagined by {project.creatorName}</p>
      <span className="playground-badge playground-badge-success">
        {makerCount} {makerCount === 1 ? "maker" : "makers"} shaping it
      </span>
      <div className="playground-actions">
        {!closed && (
          <Button
            variant="secondary"
            aria-pressed={project.hasVoted}
            disabled={disabled || project.status === "cancelled"}
            onClick={() =>
              void state.mutate(
                `${path}/vote`,
                { voted: !project.hasVoted },
                name,
              )
            }
          >
            <Heart size={15} weight={project.hasVoted ? "fill" : "regular"} />{" "}
            {project.hasVoted ? "Voted" : "Vote"} · {project.votes}
          </Button>
        )}
        {!closed && (
          <Button
            variant="primary"
            onClick={() =>
              document.getElementById("playground-contribution")?.focus()
            }
          >
            Join this build
          </Button>
        )}
        {project.plotId && (
          <Button variant="ghost" onClick={() => onVisit(project.plotId!)}>
            Visit room <ArrowUpRight size={14} />
          </Button>
        )}
      </div>
      <section className="playground-section">
        <h4>Find your way in</h4>
        <p className="panel-hint">
          Bring a sketch, reference, scene idea, sound, story, or agent.
          Joining a crew doesn’t change permission to edit another maker’s
          objects.
        </p>
        {!invitations.length && (
          <p className="panel-hint">
            The brief is open to interpretation. Offer a contribution, or bring
            your agent to help imagine what belongs here.
          </p>
        )}
        <ul>
          {invitations.map((invitation) => (
            <li key={invitation.invitationId}>
              <h4>{invitation.title}</h4>
              <p>{invitation.description}</p>
              <span className="playground-meta">
                {invitation.status === "open"
                  ? "Open invitation"
                  : "Invitation closed"}
              </span>
              <div className="playground-actions">
                {!closed && invitation.status === "open" && (
                  <button
                    onClick={() => {
                      setInvitation(invitation.invitationId);
                      document
                        .getElementById("playground-contribution")
                        ?.focus();
                    }}
                  >
                    Join this invitation
                  </button>
                )}
                {!closed && project.canManage && (
                  <button
                    disabled={disabled}
                    onClick={() =>
                      void state.mutate(
                        `${path}/invitations/${invitation.invitationId}`,
                        {
                          status:
                            invitation.status === "open" ? "closed" : "open",
                        },
                        name,
                      )
                    }
                  >
                    {invitation.status === "open"
                      ? "Close invitation"
                      : "Reopen invitation"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          onClick={() => onInvite(project.projectId)}
        >
          Bring your agent into this build
        </Button>
        {!closed && project.canManage && (
          <details>
            <summary>Open a creative invitation</summary>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await state.mutate(
                    `${path}/invitations`,
                    { title, description: inviteDescription },
                    name,
                  )
                ) {
                  setTitle("");
                  setInviteDescription("");
                }
              }}
            >
              <label>
                Invitation title
                <input
                  required
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Who lives behind the window?"
                />
              </label>
              <label>
                What can someone contribute?
                <textarea
                  required
                  maxLength={1200}
                  value={inviteDescription}
                  onChange={(e) => setInviteDescription(e.target.value)}
                />
              </label>
              <button disabled={disabled}>Open invitation</button>
            </form>
          </details>
        )}
      </section>
      {!closed && (
        <section className="playground-section">
          <h4>Bring something to the table</h4>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await state.mutate(
                  `${path}/contributions`,
                  {
                    description,
                    ...(invitationId &&
                    invitations.some(
                      (i) =>
                        i.invitationId === invitationId && i.status === "open",
                    )
                      ? { invitationId }
                      : {}),
                    ...(artifactUrl ? { artifactUrl } : {}),
                  },
                  name,
                )
              ) {
                setDescription("");
                setArtifact("");
              }
            }}
          >
            {invitations.some((i) => i.status === "open") && (
              <label>
                Contribute to
                <select
                  value={invitationId}
                  onChange={(e) => setInvitation(e.target.value)}
                >
                  <option value="">The whole idea</option>
                  {invitations
                    .filter((i) => i.status === "open")
                    .map((i) => (
                      <option key={i.invitationId} value={i.invitationId}>
                        {i.title}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Your contribution
              <textarea
                id="playground-contribution"
                required
                maxLength={1200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="An idea, reference, scene, sound, story, agent, or useful piece of this world…"
              />
            </label>
            <label>
              Link to your work (optional)
              <input
                type="url"
                pattern="https://.*"
                maxLength={2000}
                value={artifactUrl}
                onChange={(e) => setArtifact(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <button disabled={disabled}>Offer contribution · free</button>
            <p className="panel-hint">
              The project’s creator reviews contributions. Accepted work credits
              its author.
            </p>
          </form>
        </section>
      )}
      <section className="playground-section">
        <h4>Crew &amp; credit</h4>
        <p className="playground-meta">
          {makerCount} {makerCount === 1 ? "maker" : "makers"} shaping this
          idea · stewarded by {project.creatorName}
        </p>
        {accepted.length ? (
          <ul>
            {accepted.map((c) => (
              <li key={c.contributionId}>
                <strong>{c.authorName}</strong>
                <p>{c.description}</p>
                {c.artifactUrl && (
                  <a href={c.artifactUrl} target="_blank" rel="noreferrer">
                    See contribution ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-hint">
            Accepted contributions will appear here, with credit to their
            makers.
          </p>
        )}
        <details>
          <summary>
            Contribution offers (
            {contributions.filter((c) => c.status !== "accepted").length})
          </summary>
          <ul>
            {contributions
              .filter((c) => c.status !== "accepted")
              .map((c) => (
                <li key={c.contributionId}>
                  <strong>{c.authorName}</strong>
                  <p>{c.description}</p>
                  <span className="playground-meta">
                    {c.status === "offered" ? "Awaiting review" : "Declined"}
                  </span>
                  {c.artifactUrl && (
                    <p>
                      <a href={c.artifactUrl} target="_blank" rel="noreferrer">
                        See offered work ↗
                      </a>
                    </p>
                  )}
                  {c.reviewNote && <p>{c.reviewNote}</p>}
                  {!closed && project.canManage && c.status === "offered" && (
                    <div className="playground-actions">
                      <button
                        disabled={disabled}
                        onClick={() =>
                          void state.mutate(
                            `${path}/contributions/${c.contributionId}/review`,
                            { status: "accepted" },
                            name,
                          )
                        }
                      >
                        Accept & credit author
                      </button>
                      <button
                        disabled={disabled}
                        onClick={() =>
                          void state.mutate(
                            `${path}/contributions/${c.contributionId}/review`,
                            { status: "declined" },
                            name,
                          )
                        }
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </details>
        {detail.contributionCursor && (
          <button
            disabled={state.busy}
            onClick={() => void state.moreContributions()}
          >
            More contributions
          </button>
        )}
      </section>
      <ProjectFunding project={project} name={name} />
      {!closed && project.canManage && (
        <details>
          <summary>Manage this project</summary>
          <label>
            Linked room ID
            <input
              value={linkedRoom}
              onChange={(e) => setLinkedRoom(e.target.value)}
              placeholder="Room identifier"
            />
          </label>
          <button
            disabled={disabled || !linkedRoom.trim()}
            onClick={() =>
              void state.mutate(`${path}/update`, { plotId: linkedRoom }, name)
            }
          >
            Save room link
          </button>
          <p className="panel-hint">
            A room link helps visitors find this build. It does not grant
            editing permission.
          </p>
          <label>
            Project stage
            <select
              value={project.status}
              disabled={disabled}
              onChange={(e) =>
                void state.mutate(
                  `${path}/update`,
                  { status: e.target.value },
                  name,
                )
              }
            >
              {stages.map((value) => (
                <option
                  key={value}
                  value={value}
                  disabled={
                    !project.plotId && ["building", "completed"].includes(value)
                  }
                >
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
        </details>
      )}
    </article>
  );
}
