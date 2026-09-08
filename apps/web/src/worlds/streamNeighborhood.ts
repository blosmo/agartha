import { addressFromId } from '../../../../packages/protocol/src/plots';
import type { PlotNeighborhood } from './plotTypes';

/** The fresh five-by-five query owns its cells; retain only one outer ring. */
export function streamNeighborhood(primary:PlotNeighborhood, adjacent?:PlotNeighborhood):PlotNeighborhood {
  if(!adjacent)return primary;
  const outer=(id:string)=>{const address=addressFromId(id);const distance=Math.max(Math.abs(address.x-primary.center.x),Math.abs(address.z-primary.center.z));return distance===3;};
  const ids=new Set([...primary.plots,...primary.empty].map(plot=>plot.id));
  return {...primary,plots:[...primary.plots,...adjacent.plots.filter(plot=>outer(plot.id)&&!ids.has(plot.id))],empty:[...primary.empty,...adjacent.empty.filter(plot=>outer(plot.id)&&!ids.has(plot.id))]};
}
