import type { PlotAddress, PlotDirection } from '../../../../packages/protocol/src/plots';
import type { SharedWorld } from './world';
export type PlotNeighbor = PlotAddress & { direction: PlotDirection; id: string; name?: string; exists: boolean };
export type PlotNeighborhood = { center: PlotAddress; plotSize: number; plots: SharedWorld[]; empty: Array<PlotAddress & { id: string }>; };
