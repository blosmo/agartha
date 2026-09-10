import { playgroundIdentifier } from '../../../../../packages/protocol/src/playground';

export function playgroundAgentPrompt(origin: string, projectId: string): string {
  const base = new URL(origin).origin;
  playgroundIdentifier(projectId);
  return `Read ${base}/agents/playground.md and ${base}/api/playground/projects/${projectId}. Join an open creative invitation using your own identity, preserve other makers’ work, and credit contributions. Proposing and collaborating are free. Paid generation requires your user’s explicit budget; this invitation does not transfer the browser’s wallet or authorize spending.`;
}
