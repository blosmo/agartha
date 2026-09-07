import type {WorldObject} from '../../apps/web/src/worlds/world';

export const HEADLESS_RECIPES={
 body:{kind:'lathe',profile:[[.6,0],[.9,.12],[1.12,.5],[1.16,1.3],[.98,1.9],[.7,2.15],[.68,2.25]],segments:40,smooth:true,steps:4},
 lid:{kind:'lathe',profile:[[.72,0],[.8,.06],[.7,.18],[.4,.24],[.2,.32]],segments:40,smooth:true,steps:4},
 handle:{kind:'sweep',path:[[0,-.8,0],[.75,-.85,0],[1.05,-.4,0],[1.05,.45,0],[.7,.8,0],[-.2,.7,0]],radius:.12,segments:12,steps:4,smooth:true},
 knob:{kind:'torus',radius:.21,tube:.055,segments:32,tubeSegments:12,transform:{rotation:[90,0,0]}},
 foot:{kind:'roundedBox',size:[1.4,.16,1.4],radius:.075,segments:3},
 seat:{kind:'roundedBox',size:[5,.45,1.7],radius:.2,segments:3},
 leg:{kind:'roundedBox',size:[.45,1.5,1.4],radius:.18,segments:3},
 back:{kind:'roundedBox',size:[5,.7,.3],radius:.12,segments:3,transform:{rotation:[-10,0,0]}},
} as const;
export type HeadlessPart=keyof typeof HEADLESS_RECIPES;
export const HEADLESS_LAYOUT:Array<{key:HeadlessPart;id:string;position:[number,number,number];materialId:string;group:'vessel'|'bench'}>=[
 {key:'body',id:'vessel-body',position:[0,1.285,0],materialId:'pbr-ceramic',group:'vessel'},
 {key:'lid',id:'vessel-lid',position:[0,2.57,0],materialId:'pbr-ceramic',group:'vessel'},
 {key:'handle',id:'vessel-handle',position:[1.42,1.4,0],materialId:'pbr-brass',group:'vessel'},
 {key:'knob',id:'vessel-knob',position:[0,2.91,0],materialId:'pbr-brass',group:'vessel'},
 {key:'foot',id:'vessel-foot',position:[0,.08,0],materialId:'pbr-dark-wood',group:'vessel'},
 {key:'seat',id:'bench-seat',position:[0,1.6,0],materialId:'pbr-dark-wood',group:'bench'},
 {key:'leg',id:'bench-left-leg',position:[-2,.75,0],materialId:'pbr-brass',group:'bench'},
 {key:'leg',id:'bench-right-leg',position:[2,.75,0],materialId:'pbr-brass',group:'bench'},
 {key:'back',id:'bench-back',position:[0,2.1,-.7],materialId:'pbr-dark-wood',group:'bench'},
];
export function headlessObjects(meshes:Record<HeadlessPart,{id:string;geometry:{bounds:readonly number[]}}>):WorldObject[]{
 return HEADLESS_LAYOUT.map(part=>{
  const mesh=meshes[part.key],factor=part.group==='vessel'?1.5:1.2,offsetX=part.group==='vessel'?-5:4;
  return {id:`headless-${part.id}`,name:part.id.replaceAll('-',' '),author:'Headless modeling fixture',shape:'mesh',meshId:mesh.id,position:[part.position[0]*factor+offsetX,part.position[1]*factor,part.position[2]*factor],scale:mesh.geometry.bounds.map(n=>n*factor) as [number,number,number],color:'#ffffff',materialId:part.materialId};
 });
}
