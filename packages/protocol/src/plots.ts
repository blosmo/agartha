import { motionExtents, parseObjectMotion, type ObjectMotion } from './objectMotion';
export const PLOT_SIZE = 32;
export const PLOT_HALF = PLOT_SIZE / 2;
export type PlotAddress = { x: number; z: number };
export type PlotPlacement = PlotAddress & { size: 32 };
export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
export type PlotDirection = typeof DIRECTIONS[number];
const steps: Record<PlotDirection, PlotAddress> = { north: { x: 0, z: -1 }, east: { x: 1, z: 0 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 } };
export function validateAddress(address: PlotAddress) {
  if (![address.x, address.z].every(n => Number.isInteger(n) && Math.abs(n) <= 10000)) throw new Error('Plot coordinates must be integers between -10000 and 10000.');
}
export function neighborAddress(address: PlotAddress, direction: PlotDirection): PlotAddress {
  if (!DIRECTIONS.includes(direction)) throw new Error('Choose north, east, south or west.');
  const result = { x: address.x + steps[direction].x, z: address.z + steps[direction].z };
  validateAddress(result);
  return result;
}
export function plotId(address: PlotAddress) {
  validateAddress(address);
  return address.x === 0 && address.z === 0 ? 'the-commons' : `plot-${address.x}-${address.z}`;
}
export function addressFromId(id: string): PlotAddress {
  if (id === 'the-commons') return { x: 0, z: 0 };
  const match = /^plot-(-?\d+)-(-?\d+)$/.exec(id);
  if (!match) throw new Error('Unknown plot address.');
  const address = { x: Number(match[1]), z: Number(match[2]) };
  validateAddress(address);
  if (plotId(address) !== id) throw new Error('Use the canonical plot ID.');
  return address;
}
export function assertWithinPlot(object: { position: readonly number[]; scale: readonly number[]; yaw?: number; motion?: ObjectMotion }) {
  if (object.position.length !== 3 || object.scale.length !== 3 || !object.position.every(Number.isFinite) || !object.scale.every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid object transform.');
  const yaw = object.yaw ?? 0;
  if (!Number.isFinite(yaw) || Math.abs(yaw) > Math.PI * 2) throw new Error('Invalid object rotation.');
  const extents = motionExtents(object.scale, yaw, parseObjectMotion(object.motion));
  for (const axis of [0, 2]) if (Math.abs(object.position[axis]) + extents[axis] > PLOT_HALF - 0.25) throw new Error('Keep the complete object inside the plot, leaving its edge clear.');
  const minY = object.position[1] - extents[1], maxY = object.position[1] + extents[1];
  if (maxY > 0.35 && minY < 3 && ((Math.abs(object.position[0]) + extents[0] > 13 && Math.abs(object.position[2]) - extents[2] < 2.5) || (Math.abs(object.position[2]) + extents[2] > 13 && Math.abs(object.position[0]) - extents[0] < 2.5))) throw new Error('Keep the gateway corridors clear so neighboring plots remain connected.');
  if (object.position[1] - extents[1] < -8 || object.position[1] + extents[1] > 40) throw new Error('Build between -8 and 40 units in height.');
}

/** Permanent public coordinate frame. Addresses are never derived from display names. */
export const SPATIAL_FRAME = {version:1,gridId:'agartha-public-v1',axes:{x:'east',y:'up',z:'south'},unit:'world-unit',cellSize:PLOT_SIZE} as const;
export function roomLocation(address:PlotAddress){
  validateAddress(address);
  return {...SPATIAL_FRAME,roomId:plotId(address),cell:{x:address.x,z:address.z},origin:[address.x*PLOT_SIZE,0,address.z*PLOT_SIZE] as [number,number,number]};
}
export function localToWorld(address:PlotAddress,position:readonly number[]):[number,number,number]{
  validateAddress(address);if(position.length!==3||!position.every(Number.isFinite))throw new Error('Provide a finite XYZ position.');
  return [address.x*PLOT_SIZE+position[0],position[1],address.z*PLOT_SIZE+position[2]];
}
/** Half-open cells: [-16,16), so a shared edge has one unambiguous address. */
export function worldToLocal(position:readonly number[]){
  if(position.length!==3||!position.every(Number.isFinite))throw new Error('Provide a finite XYZ position.');
  const cell={x:Math.floor((position[0]+16)/32),z:Math.floor((position[2]+16)/32)};validateAddress(cell);
  return {roomId:plotId(cell),cell,position:[position[0]-cell.x*32,position[1],position[2]-cell.z*32] as [number,number,number]};
}
