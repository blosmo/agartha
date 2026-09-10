import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  mkdir,
  link,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  PLAYGROUND_LIMITS as L,
  playgroundIdentifier,
  playgroundText,
  playgroundUrl,
  type PlaygroundProject,
  type PlaygroundDetail,
  type PlaygroundInvitation,
  type PlaygroundContribution,
} from "../../packages/protocol/src/playground";
import { addressFromId } from "../../packages/protocol/src/plots";
import { WorldError } from "./src/worlds/world";
export type PlaygroundViewer = { agentId: string; name: string };
type Project = Omit<PlaygroundProject, "hasVoted" | "canManage" | "votes"> & {
  voters: string[];
};
type State = {
  schema: 1;
  sessions: Array<PlaygroundViewer & { digest: string }>;
  projects: Project[];
  invitations: PlaygroundInvitation[];
  contributions: PlaygroundContribution[];
  requests: Array<{
    key: string;
    fingerprint: string;
    projectId: string;
    at: number;
  }>;
};
const empty = (): State => ({
  schema: 1,
  sessions: [],
  projects: [],
  invitations: [],
  contributions: [],
  requests: [],
});
type LockOwner = { pid: number; nonce: string };
async function lockOwner(path: string): Promise<LockOwner | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return Number.isSafeInteger(value.pid) && value.pid > 0 && typeof value.nonce === "string" && /^[a-f0-9-]{36}$/.test(value.nonce) ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}
function ownerIsDead(pid: number): boolean {
  try { process.kill(pid, 0); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
}
/** Elect one reaper per lock generation. A contender can never unlink a replacement lock. */
async function recoverDeadLock(path: string, candidate: string): Promise<void> {
  const owner = await lockOwner(path);
  if (!owner || !ownerIsDead(owner.pid)) return;
  const claims: string[] = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    const claim = `${path}.reap-${owner.nonce}-${attempt}`;
    claims.push(claim);
    try {
      await link(candidate, claim);
      try {
        const current = await lockOwner(path);
        if (current?.nonce === owner.nonce && current.pid === owner.pid) await unlink(path);
      } finally {
        // Cleanup happens only after removal, so a later reaper must observe a new generation.
        for (const item of claims) await unlink(item).catch(() => {});
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const reaper = await lockOwner(claim);
      if (!reaper || !ownerIsDead(reaper.pid)) return;
    }
  }
}
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
function cursor(value?: string | null) {
  if (!value) return 0;
  if (!/^\d{1,9}$/.test(value)) throw new WorldError("Invalid cursor.");
  return Number(value);
}
export class PlaygroundStore {
  constructor(
    private file: string,
    private checkPlot?: (id: string) => Promise<unknown>,
  ) {}
  private async read(): Promise<State> {
    try {
      const state = JSON.parse(await readFile(this.file, "utf8"));
      if (state.schema !== 1) throw new Error("Invalid playground storage");
      return state;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty();
      throw e;
    }
  }
  private async write<T>(action: (state: State) => T | Promise<T>): Promise<T> {
    await mkdir(dirname(this.file), { recursive: true });
    const path = `${this.file}.lock`;
    const nonce = randomUUID();
    const candidate = `${path}.candidate-${nonce}`;
    const temp = `${this.file}.${nonce}.tmp`;
    let acquired = false;
    // Publish only a complete owner record, avoiding an empty lock if a process crashes.
    await writeFile(candidate, JSON.stringify({ pid: process.pid, nonce }), { flag: "wx", mode: 0o600 });
    try {
      for (let n = 0; !acquired && n < 100; n++) {
        try { await link(candidate, path); acquired = true; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          await recoverDeadLock(path, candidate);
          await delay(20);
        }
      }
      if (!acquired) throw new WorldError("Playground busy. Retry the same request.", 503);
      const state = await this.read();
      const result = await action(state);
      await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
      await rename(temp, this.file);
      return result;
    } finally {
      await unlink(temp).catch(() => {});
      if (acquired && (await lockOwner(path))?.nonce === nonce) await unlink(path);
      await unlink(candidate).catch(() => {});
    }
  }
  async viewer(token?: string): Promise<PlaygroundViewer | null> {
    const s = token
      ? (await this.read()).sessions.find((s) => s.digest === digest(token))
      : undefined;
    return s ? { agentId: s.agentId, name: s.name } : null;
  }
  async session(name: string, suppliedToken?: string) {
    const clean = playgroundText(name, "Name", 60);
    if (suppliedToken !== undefined && !/^[a-f0-9]{64}$/.test(suppliedToken)) throw new WorldError("Use a 32-byte hexadecimal agent token.");
    const token = suppliedToken ?? randomBytes(32).toString("hex");
    return this.write((s) => {
      const existing = s.sessions.find(item => item.digest === digest(token));
      if (existing) return { agentId: existing.agentId, name: existing.name, agentToken: token };
      const viewer = { agentId: `local-${randomUUID()}`, name: clean };
      s.sessions.push({ ...viewer, digest: digest(token) });
      return { ...viewer, agentToken: token };
    });
  }
  private project(s: State, id: string) {
    const p = s.projects.find((p) => p.projectId === id);
    if (!p) throw new WorldError("Project not found.", 404);
    return p;
  }
  private public(p: Project, v: PlaygroundViewer | null): PlaygroundProject {
    const { voters, ...rest } = p;
    return {
      ...rest,
      votes: voters.length,
      hasVoted: !!v && voters.includes(v.agentId),
      canManage: p.creatorId === v?.agentId,
    };
  }
  private detail(
    s: State,
    id: string,
    v: PlaygroundViewer | null,
  ): PlaygroundDetail {
    const all = s.contributions.filter((c) => c.projectId === id).reverse();
    return {
      project: this.public(this.project(s, id), v),
      invitations: s.invitations.filter((i) => i.projectId === id),
      contributions: all.slice(0, L.pageSize),
      contributionCursor: all.length > L.pageSize ? String(L.pageSize) : null,
      viewer: v,
    };
  }
  async get(id: string, v: PlaygroundViewer | null) {
    return this.detail(await this.read(), id, v);
  }
  async list(
    v: PlaygroundViewer | null,
    options: {
      cursor?: string | null;
      status?: string | null;
      plotId?: string | null;
    } = {},
  ) {
    if (options.status && options.plotId) throw new WorldError("Filter by either room or status.");
    if (options.status && !["idea", "funding", "ready", "building", "completed", "cancelled"].includes(options.status)) throw new WorldError("Invalid project status.");
    const at = cursor(options.cursor);
    const all = (await this.read()).projects
      .filter(
        (p) =>
          (!options.status || p.status === options.status) &&
          (!options.plotId || p.plotId === options.plotId),
      )
      .reverse();
    return {
      page: all.slice(at, at + L.pageSize).map((p) => this.public(p, v)),
      continueCursor:
        at + L.pageSize < all.length ? String(at + L.pageSize) : null,
    };
  }
  async contributions(id: string, value?: string | null) {
    const s = await this.read();
    this.project(s, id);
    const at = cursor(value),
      all = s.contributions.filter((c) => c.projectId === id).reverse();
    return {
      page: all.slice(at, at + L.pageSize),
      continueCursor:
        at + L.pageSize < all.length ? String(at + L.pageSize) : null,
    };
  }
  async mutate(
    v: PlaygroundViewer,
    action: string,
    input: Record<string, unknown>,
    id?: string,
    child?: string,
  ) {
    playgroundIdentifier(input.requestId as string);
    const fingerprint = JSON.stringify([
      action,
      id,
      child,
      Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    if (input.plotId !== undefined && input.plotId !== "") {
      addressFromId(input.plotId as string);
      await this.checkPlot?.(input.plotId as string);
    }
    return this.write((s) => {
      const key = `${v.agentId}:${input.requestId}`,
        prev = s.requests.find((r) => r.key === key);
      if (prev) {
        if (prev.fingerprint !== fingerprint)
          throw new WorldError(
            "requestId already used for a different operation.",
            409,
          );
        return this.detail(s, prev.projectId, v);
      }
      const now = Date.now();
      if (
        s.requests.filter(
          (r) => r.key.startsWith(`${v.agentId}:`) && r.at > now - 60000,
        ).length >= 30
      )
        throw new WorldError(
          "Too many playground changes. Try again shortly.",
          429,
        );
      let p: Project;
      if (action === "create") {
        p = {
          projectId: `project-${randomUUID()}`,
          creatorId: v.agentId,
          creatorName: v.name,
          title: playgroundText(input.title as string, "Title", L.title),
          brief: playgroundText(input.brief as string, "Brief", L.brief),
          imageUrl: playgroundUrl(input.imageUrl as string | undefined),
          plotId: input.plotId as string | undefined,
          status: "idea",
          voters: [],
          createdAt: now,
          updatedAt: now,
        };
        s.projects.push(p);
      } else {
        p = this.project(s, id!);
        if (["completed", "cancelled"].includes(p.status)) throw new WorldError("This project is closed.", 409);
        if (
          ["update", "invite", "invitation", "review"].includes(action) &&
          p.creatorId !== v.agentId
        )
          throw new WorldError("Only the project creator can do this.", 403);
        if (action === "vote") {
          if (typeof input.voted !== "boolean")
            throw new WorldError("Choose voted true or false.");
          p.voters = p.voters.filter((a) => a !== v.agentId);
          if (input.voted) p.voters.push(v.agentId);
        } else if (action === "update") {
          if (
            p.status !== "idea" &&
            Object.keys(input).some((k) =>
              ["title", "brief", "imageUrl"].includes(k),
            )
          )
            throw new WorldError(
              "The brief is locked after the idea stage.",
              409,
            );
          if (input.title !== undefined)
            p.title = playgroundText(input.title as string, "Title", L.title);
          if (input.brief !== undefined)
            p.brief = playgroundText(input.brief as string, "Brief", L.brief);
          if (input.imageUrl !== undefined)
            p.imageUrl = playgroundUrl(input.imageUrl as string);
          if (input.plotId !== undefined)
            p.plotId = (input.plotId as string) || undefined;
          if (input.status !== undefined) {
            const next = input.status;
            const allowed =
              next === p.status ||
              (p.status === "idea" &&
                ["building", "cancelled"].includes(next as string)) ||
              (p.status === "building" &&
                ["completed", "cancelled"].includes(next as string));
            if (!allowed)
              throw new WorldError(
                "Invalid project transition; funding requires the hosted service.",
                409,
              );
            if (["building", "completed"].includes(next as string) && !p.plotId)
              throw new WorldError(
                "Link an existing plot before building.",
                409,
              );
            p.status = input.status as Project["status"];
          }
        } else if (action === "invite") {
          if (["completed", "cancelled"].includes(p.status))
            throw new WorldError("This project is closed.", 409);
          if (
            s.invitations.filter((i) => i.projectId === p.projectId).length >=
            L.invitations
          )
            throw new WorldError("Invitation limit reached.", 409);
          s.invitations.push({
            invitationId: `invitation-${randomUUID()}`,
            projectId: p.projectId,
            title: playgroundText(input.title as string, "Title", L.title),
            description: playgroundText(
              input.description as string,
              "Description",
              L.description,
            ),
            status: "open",
            createdAt: now,
          });
        } else if (action === "invitation") {
          const i = s.invitations.find(
            (i) => i.projectId === p.projectId && i.invitationId === child,
          );
          if (!i) throw new WorldError("Invitation not found.", 404);
          if (!["open", "closed"].includes(input.status as string))
            throw new WorldError("Invalid invitation status.");
          i.status = input.status as "open" | "closed";
        } else if (action === "contribute") {
          if (["completed", "cancelled"].includes(p.status))
            throw new WorldError("This project is closed.", 409);
          if (
            input.invitationId &&
            !s.invitations.some(
              (i) =>
                i.invitationId === input.invitationId &&
                i.projectId === p.projectId &&
                i.status === "open",
            )
          )
            throw new WorldError("Choose an open invitation.");
          s.contributions.push({
            contributionId: `contribution-${randomUUID()}`,
            projectId: p.projectId,
            invitationId: input.invitationId as string | undefined,
            authorId: v.agentId,
            authorName: v.name,
            description: playgroundText(
              input.description as string,
              "Description",
              L.description,
            ),
            artifactUrl: playgroundUrl(input.artifactUrl as string | undefined),
            status: "offered",
            createdAt: now,
          });
        } else if (action === "review") {
          const c = s.contributions.find(
            (c) => c.projectId === p.projectId && c.contributionId === child,
          );
          if (!c) throw new WorldError("Contribution not found.", 404);
          if (!["accepted", "declined"].includes(input.status as string))
            throw new WorldError("Invalid review status.");
          if (c.status !== "offered")
            throw new WorldError("Contribution already reviewed.", 409);
          c.status = input.status as "accepted" | "declined";
          if (input.reviewNote)
            c.reviewNote = playgroundText(
              input.reviewNote as string,
              "Review note",
              L.description,
            );
        } else throw new WorldError("Not found.", 404);
        p.updatedAt = now;
      }
      s.requests.push({ key, fingerprint, projectId: p.projectId, at: now });
      return this.detail(s, p.projectId, v);
    });
  }
}
