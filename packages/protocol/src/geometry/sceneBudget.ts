export const ROOM_RENDER_LIMITS={objects:1000,triangles:200000,draws:128,uniqueGeometry:32,animatedTriangles:100000} as const;
export type GeometryCost={triangles:number;draws?:number};
export type BudgetObject={shape:string;meshId?:string;modelId?:string;materialId?:string;shaderId?:string;motion?:unknown;animation?:unknown};
export type SceneCost={objects:number;triangles:number;draws:number;uniqueGeometry:number;animatedTriangles:number};
const primitiveTriangles:Record<string,number>={box:12,sphere:352,cone:16,cylinder:96};
/** Main-pass rendering cost; repeated custom meshes share draws but still process triangles per instance. */
export function sceneCost(objects:readonly BudgetObject[],geometry:ReadonlyMap<string,GeometryCost>):SceneCost {
 const groups=new Set<string>(),ids=new Set<string>();let triangles=0,animatedTriangles=0,modelDraws=0;
 for(const object of objects){
  const id=object.meshId??object.modelId;
  const cost=id?geometry.get(id):{triangles:primitiveTriangles[object.shape]};
  if(!cost||!Number.isSafeInteger(cost.triangles)||cost.triangles<0)throw new Error('Geometry cost is unavailable.');
  triangles+=cost.triangles;if(object.motion||object.animation)animatedTriangles+=cost.triangles;
  if(id)ids.add(id);
  if(object.modelId)modelDraws+=cost.draws??1;
  else groups.add(`${object.shape}:${id??''}:${object.materialId??''}:${object.shaderId??''}`);
 }
 return {objects:objects.length,triangles,draws:groups.size+modelDraws,uniqueGeometry:ids.size,animatedTriangles};
}
export function assertRoomRenderBudget(next:SceneCost,previous?:SceneCost){
 for(const key of Object.keys(ROOM_RENDER_LIMITS) as Array<keyof SceneCost>){
  if(next[key]>ROOM_RENDER_LIMITS[key]&&(!previous||next[key]>previous[key]))throw new Error(`Room exceeds its ${key} rendering budget (${next[key]} / ${ROOM_RENDER_LIMITS[key]}). Reuse simpler geometry or distribute the scene across rooms.`);
 }
}
