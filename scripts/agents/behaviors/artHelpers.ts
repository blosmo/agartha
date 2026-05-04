import type { AgentPerception } from "@agartha/protocol/actions";
import { toAbsoluteCoord, toWorldCoord, type WorldCoord } from "@agartha/protocol/world";

export function responseLead(perception: AgentPerception, fallback: string) {
  const previous = perception.collaboration?.recentMessages.at(-1);
  if (!previous || previous.authorAgentId === perception.agentId) return fallback;
  return `I heard ${humanizeAgentId(previous.authorAgentId)}: ${clip(previous.body)} I will build on that.`;
}

export function openCells(perception: AgentPerception, candidates: ReadonlyArray<readonly [number, number]>, count: number) {
  const occupied = new Set(perception.visibleCells.map((cell) => coordKey(cell.coord)));
  const center = toAbsoluteCoord(perception.position);
  return [...candidates, ...nearbyFallbackCells(center.x, center.y)]
    .map(([x, y]) => toWorldCoord(x, y))
    .filter((coord) => withinActionRange(perception.position, coord))
    .filter((coord) => !occupied.has(coordKey(coord)))
    .slice(0, count);
}

export function shouldExplore(perception: AgentPerception, openCellCount: number, desiredCells: number) {
  return openCellCount < desiredCells || perception.visibleCells.length > 18;
}

export function nextCuriosityCoord(agentId: string, current: WorldCoord) {
  const absolute = toAbsoluteCoord(current);
  const offset = roamingOffset(agentId);
  const minX = 24 + offset.x;
  const minY = 24 + offset.y;
  const maxX = 112;
  const maxY = 112;
  const step = 18;
  let x = absolute.x;
  let y = absolute.y;

  if (x < maxX) x = Math.min(maxX, x + step);
  else if (y < maxY) y = Math.min(maxY, y + step);
  else if (x > minX) x = Math.max(minX, x - step);
  else if (y > minY) y = Math.max(minY, y - step);
  else x = Math.min(maxX, x + step);

  return toWorldCoord(x, y);
}

export function coordKey(coord: WorldCoord) {
  const absolute = toAbsoluteCoord(coord);
  return `${absolute.x}:${absolute.y}`;
}

function humanizeAgentId(agentId: string) {
  return agentId.replace(/^agent-/, "").replaceAll("-", " ");
}

function clip(body: string) {
  return body.length > 88 ? `${body.slice(0, 85)}...` : body;
}

function nearbyFallbackCells(centerX: number, centerY: number): ReadonlyArray<readonly [number, number]> {
  const cells: Array<readonly [number, number]> = [];
  for (let radius = 3; radius <= 26; radius += 3) {
    cells.push(
      [centerX - radius, centerY],
      [centerX + radius, centerY],
      [centerX, centerY - radius],
      [centerX, centerY + radius],
      [centerX - radius, centerY - radius],
      [centerX + radius, centerY - radius],
      [centerX - radius, centerY + radius],
      [centerX + radius, centerY + radius],
    );
  }
  return cells;
}

function withinActionRange(origin: WorldCoord, target: WorldCoord) {
  const a = toAbsoluteCoord(origin);
  const b = toAbsoluteCoord(target);
  return Math.abs(a.x - b.x) <= 24 && Math.abs(a.y - b.y) <= 24;
}

function roamingOffset(agentId: string) {
  if (agentId.includes("firebreak")) return { x: 4, y: 0 };
  if (agentId.includes("stream")) return { x: 0, y: 4 };
  if (agentId.includes("cartographer")) return { x: 4, y: 4 };
  if (agentId.includes("steward")) return { x: 8, y: 8 };
  return { x: 0, y: 0 };
}
