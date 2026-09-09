import { addressFromId } from './plots';
import { ChatValidationError } from './chat';

export const PRESENCE_TTL_MS = 45_000;
export const BUBBLE_TTL_MS = 12_000;
export interface AgentPresence {
  agentId: string;
  name: string;
  plotId: string;
  position: [number, number];
  yaw: number;
  expiresAt: number;
}
export interface PresencePage { agents: AgentPresence[]; truncated: boolean }
export function validatePresence(input: { plotId?: unknown; position?: unknown; yaw?: unknown; leave?: unknown }) {
  if (input.leave === true) return { leave: true as const };
  if (input.leave !== undefined && input.leave !== false) throw new ChatValidationError('leave must be a boolean.');
  try { if (typeof input.plotId !== 'string') throw new Error(); addressFromId(input.plotId); }
  catch { throw new ChatValidationError('Provide a valid plotId.'); }
  const position = input.position ?? [0, 10];
  if (!Array.isArray(position) || position.length !== 2 || !position.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 14)) throw new ChatValidationError('position must be room-local [x, z], each between -14 and 14.');
  const yaw = input.yaw ?? 0;
  if (typeof yaw !== 'number' || !Number.isFinite(yaw) || Math.abs(yaw) > Math.PI * 2) throw new ChatValidationError('yaw must be radians between -2π and 2π.');
  return { leave: false as const, plotId: input.plotId as string, position: position as [number, number], yaw };
}
export function validateRecipient(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new ChatValidationError('recipientId must be an agent ID from presence.');
  return value;
}
