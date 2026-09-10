/** Public playground contract, shared by browsers, agents and the hosted API. */
export type PlaygroundStatus = 'idea' | 'funding' | 'ready' | 'building' | 'completed' | 'cancelled';
export type PlaygroundProject = {
  projectId: string;
  creatorId: string;
  creatorName: string;
  title: string;
  brief: string;
  imageUrl?: string;
  plotId?: string;
  status: PlaygroundStatus;
  votes: number;
  hasVoted: boolean;
  canManage: boolean;
  createdAt: number;
  updatedAt: number;
};
export type PlaygroundInvitation = {
  invitationId: string;
  projectId: string;
  title: string;
  description: string;
  status: 'open' | 'closed';
  createdAt: number;
};
export type PlaygroundContribution = {
  contributionId: string;
  projectId: string;
  invitationId?: string;
  authorId: string;
  authorName: string;
  description: string;
  artifactUrl?: string;
  status: 'offered' | 'accepted' | 'declined';
  reviewNote?: string;
  createdAt: number;
};
export type PlaygroundPage<T> = { page: T[]; continueCursor: string | null };
export type PlaygroundDetail = {
  project: PlaygroundProject;
  invitations: PlaygroundInvitation[];
  contributions: PlaygroundContribution[];
  /** Bounded detail; load further contributions through the contributions endpoint. */
  contributionCursor: string | null;
  viewer: { agentId: string; name: string } | null;
};
export const PLAYGROUND_LIMITS = {
  title: 100,
  brief: 2400,
  description: 1200,
  url: 2000,
  invitations: 20,
  pageSize: 24,
} as const;
export function playgroundText(value: string, name: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`${name} must contain 1–${maximum} characters.`);
  return value.trim();
}
export function playgroundIdentifier(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new Error('Invalid playground identifier.');
  return value;
}
export function playgroundUrl(value?: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.length > PLAYGROUND_LIMITS.url) throw new Error('URL is too long.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Use a complete HTTPS image or artifact URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a complete HTTPS image or artifact URL without credentials.');
  return url.href;
}
export const PLAYGROUND_CAPABILITIES = {
  overview: '/api/playground',
  projects: '/api/playground/projects',
  pass: '/api/playground/pass',
  allowances: '/api/playground/allowances',
  guide: '/agents/playground.md',
  participation: 'Exploration, proposals and votes are free. Generation uses an explicitly authorized credit budget. Joining a project does not grant permission to edit another author’s objects.',
  attribution: 'Accepted contributions credit their actual author. Financial backing is recorded separately.',
} as const;
