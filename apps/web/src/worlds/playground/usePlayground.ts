import { useEffect, useRef, useState } from "react";
import type {
  PlaygroundDetail,
  PlaygroundPage,
  PlaygroundProject,
} from "../../../../../packages/protocol/src/playground";

import { playgroundRequest, PlaygroundRequestError } from "./api";
import { ensurePlaygroundSession } from "./identity";
export { playgroundRequest, PlaygroundRequestError } from "./api";
type Pending = { path: string; body: Record<string, unknown> };
let pendingWrite: Pending | undefined;
const base = "/api/playground/projects";
export function usePlayground() {
  const [projects, setProjects] = useState<PlaygroundProject[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlaygroundDetail>();
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [pending, setPending] = useState(pendingWrite);
  const alive = useRef(true),
    listVersion = useRef(0),
    detailVersion = useRef(0),
    writing = useRef(false),
    selected = useRef<string | undefined>(undefined);
  async function refresh(more = false) {
    const version = ++listVersion.current;
    setLoading(true);
    try {
      const page = await playgroundRequest<PlaygroundPage<PlaygroundProject>>(
        `${base}${more && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (!alive.current || listVersion.current !== version) return;
      setProjects((old) =>
        more
          ? [
              ...old,
              ...page.page.filter(
                (item) => !old.some((p) => p.projectId === item.projectId),
              ),
            ]
          : page.page,
      );
      setCursor(page.continueCursor);
    } catch (e) {
      if (alive.current && listVersion.current === version)
        setError(e instanceof Error ? e.message : "Unable to load ideas.");
    } finally {
      if (alive.current && listVersion.current === version) setLoading(false);
    }
  }
  async function open(id?: string) {
    selected.current = id;
    setSelectedId(id);
    setDetail(undefined);
    setError("");
    setNotice("");
    const version = ++detailVersion.current;
    if (!id) return;
    try {
      const value = await playgroundRequest<PlaygroundDetail>(
        `${base}/${encodeURIComponent(id)}`,
      );
      if (alive.current && version === detailVersion.current) setDetail(value);
    } catch (e) {
      if (alive.current && version === detailVersion.current)
        setError(e instanceof Error ? e.message : "Unable to open this idea.");
    }
  }
  async function mutate(
    path: string,
    body: Record<string, unknown>,
    name: string,
    retry = false,
  ) {
    if (writing.current || (pendingWrite && !retry)) return false;
    const next =
      retry && pendingWrite
        ? pendingWrite
        : { path, body: { ...body, requestId: crypto.randomUUID() } };
    writing.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const selectionAtStart = selected.current;
    let sent = false;
    try {
      await ensurePlaygroundSession(name);
      pendingWrite = next;
      if (alive.current) setPending(next);
      sent = true;
      const value = await playgroundRequest<PlaygroundDetail>(
        next.path,
        next.body,
      );
      pendingWrite = undefined;
      if (!alive.current) return true;
      setPending(undefined);
      setNotice("Saved to the playground.");
      if (selected.current === selectionAtStart) {
        ++detailVersion.current;
        selected.current = value.project.projectId;
        setSelectedId(value.project.projectId);
        setDetail(value);
      }
      void refresh();
      return true;
    } catch (e) {
      if (
        sent &&
        e instanceof PlaygroundRequestError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 408 &&
        e.status !== 429
      )
        pendingWrite = undefined;
      if (alive.current) {
        setPending(pendingWrite);
        setError(
          pendingWrite
            ? "The result is not confirmed. Retry the same request safely before making another change."
            : e instanceof Error
              ? e.message
              : "Unable to save.",
        );
      }
      return false;
    } finally {
      writing.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function moreContributions() {
    if (!detail?.contributionCursor || busy) return;
    const version = detailVersion.current;
    setBusy(true);
    try {
      const page = await playgroundRequest<
        PlaygroundPage<PlaygroundDetail["contributions"][number]>
      >(
        `${base}/${detail.project.projectId}/contributions?cursor=${encodeURIComponent(detail.contributionCursor)}`,
      );
      if (alive.current && version === detailVersion.current)
        setDetail(
          (old) =>
            old && {
              ...old,
              contributions: [
                ...old.contributions,
                ...page.page.filter(
                  (item) =>
                    !old.contributions.some(
                      (c) => c.contributionId === item.contributionId,
                    ),
                ),
              ],
              contributionCursor: page.continueCursor,
            },
        );
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Unable to load contributions.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      ++listVersion.current;
      ++detailVersion.current;
    };
  }, []);
  return {
    projects,
    cursor,
    detail,
    selectedId,
    loading,
    busy,
    error,
    notice,
    pending,
    refresh,
    open,
    mutate,
    moreContributions,
    retry: (name: string) =>
      pendingWrite
        ? mutate(pendingWrite.path, pendingWrite.body, name, true)
        : Promise.resolve(false),
  };
}
export type PlaygroundState = ReturnType<typeof usePlayground>;
