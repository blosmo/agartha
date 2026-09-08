import { validateAddress, type PlotAddress } from './plots';

export function neighborhoodCells(center: PlotAddress, radius = 1): PlotAddress[] {
  validateAddress(center);
  if (!Number.isInteger(radius) || radius < 1 || radius > 2) throw new Error('Neighborhood radius must be 1 or 2.');
  const cells: PlotAddress[] = [];
  for (let x = center.x-radius; x <= center.x+radius; x++) {
    for (let z = center.z-radius; z <= center.z+radius; z++) {
      if (Math.abs(x) <= 10000 && Math.abs(z) <= 10000) cells.push({ x, z });
    }
  }
  return cells;
}

export function neighborhoodObjectLimit(center: PlotAddress, cell: PlotAddress) {
  const distance = Math.max(Math.abs(cell.x-center.x), Math.abs(cell.z-center.z));
  return distance === 0 ? 1000 : distance === 1 ? 200 : 64;
}
