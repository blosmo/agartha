import { useEffect, useRef, useState } from "react";
import { ensureCloudSession } from "../cloudMode";
import type {
  GovernanceScope,
  GovernanceScopeView,
  GovernanceProposalView,
  GovernancePage,
  GovernanceComment,
} from "../../../../../packages/protocol/src/governance";
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body
      ? {
          signal: AbortSignal.timeout(25000),
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {signal: AbortSignal.timeout(25000)},
  );
  const value = await response.json();
  if (!response.ok)
    throw new RequestError(
      typeof value.error === "string"
        ? value.error
        : "Unable to load governance.",
      response.status,
    );
  return value;
}
type Pending = { path: string; body: Record<string, unknown> };
// Preserve uncertain requests when the user closes the panel or changes scopes.
const pendingByScope = new Map<GovernanceScope, Pending>();
export function useGovernance(scope: GovernanceScope) {
  const [overview, setOverview] = useState<GovernanceScopeView>();
  const [proposals, setProposals] = useState<GovernanceProposalView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<GovernanceProposalView>();
  const [comments, setComments] = useState<GovernanceComment[]>([]);
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Pending | undefined>(() =>
      pendingByScope.get(scope),
    );
  const [success, setSuccess] = useState<Pending>();
  const [loadingMore, setLoadingMore] = useState(false),
    [loadingComments, setLoadingComments] = useState(false);
  const alive = useRef(true),
    selection = useRef(0),
    reading = useRef(0),
    writing = useRef(false);
  const listPage = useRef<symbol | null>(null),
    commentPage = useRef<symbol | null>(null);
  const selectedId = useRef<string | undefined>(undefined);
  const listCursor = useRef<string | null>(null);
  const discussionCursor = useRef<string | null>(null);
  async function refresh() {
    const serial = ++reading.current;
    listPage.current = null;
    listCursor.current = null;
    setCursor(null);
    setLoadingMore(false);
    try {
      await ensureCloudSession();
      const [view, list] = await Promise.all([
        request<GovernanceScopeView>(
          `/api/governance?scope=${encodeURIComponent(scope)}`,
        ),
        request<GovernancePage<GovernanceProposalView>>(
          `/api/governance/proposals?scope=${encodeURIComponent(scope)}`,
        ),
      ]);
      if (alive.current && serial === reading.current) {
        setOverview(view);
        setProposals(list.page);
        listCursor.current = list.continueCursor;
        setCursor(list.continueCursor);
        if (!pendingByScope.has(scope)) setError("");
      }
    } catch (e) {
      if (alive.current && serial === reading.current)
        setError(e instanceof Error ? e.message : "Unable to load rules.");
    }
  }
  useEffect(() => {
    alive.current = true;
    if (pendingByScope.has(scope))
      setError(
        "A previous request has not been confirmed. Retry to check its result.",
      );
    void refresh();
    return () => {
      alive.current = false;
    };
  }, []);
  async function openProposal(id: string, more = false) {
    if (
      more &&
      (!discussionCursor.current ||
        commentPage.current ||
        selectedId.current !== id)
    )
      return;
    const serial = more ? selection.current : ++selection.current;
    const pageToken = more ? Symbol() : null;
    if (more) {
      commentPage.current = pageToken;
      setLoadingComments(true);
    } else {
      commentPage.current = null;
      discussionCursor.current = null;
      setCommentCursor(null);
      setLoadingComments(false);
      if (selectedId.current !== id) {
        setSelected(undefined);
        setComments([]);
        setCommentCursor(null);
      }
      selectedId.current = id;
    }
    try {
      const base = `/api/governance/proposals/${encodeURIComponent(id)}`;
      const [proposal, page] = await Promise.all([
        request<GovernanceProposalView>(base),
        request<GovernancePage<GovernanceComment>>(
          `${base}/comments${more ? `?cursor=${encodeURIComponent(commentCursor!)}` : ""}`,
        ),
      ]);
      if (
        alive.current &&
        serial === selection.current &&
        (!more || commentPage.current === pageToken)
      ) {
        setSelected(proposal);
        setComments((old) => (more ? [...old, ...page.page] : page.page));
        discussionCursor.current = page.continueCursor;
        setCommentCursor(page.continueCursor);
        if (!pendingByScope.has(scope)) setError("");
      }
    } catch (e) {
      if (alive.current && serial === selection.current)
        setError(e instanceof Error ? e.message : "Unable to load proposal.");
    } finally {
      if (more && commentPage.current === pageToken) {
        commentPage.current = null;
        if (alive.current) setLoadingComments(false);
      }
    }
  }
  async function mutate(
    path: string,
    body: Record<string, unknown>,
    retry = false,
  ) {
    if (writing.current || (!retry && pending)) return;
    const next =
      retry && pending
        ? pending
        : { path, body: { ...body, requestId: crypto.randomUUID() } };
    const isCurrent = () =>
      pendingByScope.get(scope)?.body.requestId === next.body.requestId;
    writing.current = true;
    pendingByScope.set(scope, next);
    setBusy(true);
    setPending(next);
    setError("");
    try {
      await ensureCloudSession();
      const result = await request<
        GovernanceProposalView | GovernanceScopeView | GovernanceComment
      >(next.path, next.body);
      // Shared ownership protects newer mounts; this live request still settles locally.
      if (isCurrent()) pendingByScope.delete(scope);
      if (!alive.current) return;
      setPending(undefined);
      setSuccess(next);
      await refresh();
      if ("status" in result) await openProposal(result.id);
      else if (selectedId.current) await openProposal(selectedId.current);
    } catch (e) {
      if (isCurrent() && e instanceof RequestError && e.status < 500)
        pendingByScope.delete(scope);
      if (!alive.current) return;
      if (e instanceof RequestError && e.status < 500) {
        setPending(undefined);
        if (e.status === 409) {
          await refresh();
          if (selectedId.current) await openProposal(selectedId.current);
        }
      }
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      writing.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function more() {
    if (!listCursor.current || listPage.current) return;
    const requestedCursor = listCursor.current;
    const serial = reading.current,
      pageToken = Symbol();
    listPage.current = pageToken;
    setLoadingMore(true);
    try {
      const page = await request<GovernancePage<GovernanceProposalView>>(
        `/api/governance/proposals?scope=${encodeURIComponent(scope)}&cursor=${encodeURIComponent(requestedCursor)}`,
      );
      if (
        alive.current &&
        serial === reading.current &&
        listPage.current === pageToken &&
        listCursor.current === requestedCursor
      ) {
        setProposals((old) => [...old, ...page.page]);
        listCursor.current = page.continueCursor;
        setCursor(page.continueCursor);
        if (!pendingByScope.has(scope)) setError("");
      }
    } catch (e) {
      if (
        alive.current &&
        serial === reading.current &&
        listPage.current === pageToken &&
        listCursor.current === requestedCursor
      )
        setError(e instanceof Error ? e.message : "Unable to load proposals.");
    } finally {
      if (listPage.current === pageToken) {
        listPage.current = null;
        if (alive.current) setLoadingMore(false);
      }
    }
  }
  return {
    overview,
    proposals,
    selected,
    comments,
    commentCursor,
    cursor,
    error,
    busy,
    loadingMore,
    loadingComments,
    success,
    blocked: busy || !!pending,
    pending,
    refresh,
    openProposal,
    mutate,
    more,
    retry: () => pending && mutate(pending.path, pending.body, true),
  };
}
