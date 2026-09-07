import type { WorldEdit } from '../apps/web/src/worlds/world';

type Object = NonNullable<WorldEdit['objects']>[number];
export const INSTALLATION_SURFACES = {
  water: {kind:'shader',name:'Tidal rings',description:'Concentric turquoise ripples travel across still geometry.',expression:'mix(vec3f(0.035, 0.19, 0.24), vec3f(0.36, 0.82, 0.77), pow(0.5 + 0.5 * sin(length(position.xz) * 52.0 - time * 2.0), 8.0))'},
  light: {kind:'shader',name:'Amber breath',description:'A slow amber pulse for room lanterns and suns.',expression:'mix(vec3f(0.56, 0.21, 0.065), vec3f(1.0, 0.84, 0.4), 0.5 + 0.5 * sin(time * 1.2 + position.y * 2.0))'},
  crystal: {kind:'shader',name:'Jade current',description:'Jade and pearl bands flow over floating sculptures.',expression:'mix(vec3f(0.08, 0.34, 0.34), vec3f(0.7, 0.93, 0.81), 0.5 + 0.5 * sin(position.y * 18.0 - time))'},
} as const;

export function roomInstallations(shaders: Record<keyof typeof INSTALLATION_SURFACES, string>) {
  function object(id: string, name: string, shape: Object['shape'], position: Object['position'], scale: Object['scale'], color: string, extra: Partial<Object> = {}): Object {
    return { id:`motion-${id}`, name, shape, position, scale, color, ...extra };
  }
  function lantern(id: string, x: number, z: number, phase: number): Object[] {
    return [
      object(`${id}-foot`,'Lantern pedestal','cylinder',[x,.5,z],[1.2,1,1.2],'#8b836e'),
      object(`${id}-light`,'Breathing lantern','sphere',[x,1.6,z],[1.1,1.1,1.1],'#f4cd82',{shaderId:shaders.light,motion:{kind:'float',amplitude:.2,speed:.8,phase}}),
    ];
  }
  const common: Object[] = [
    object('common-pool-base','Ripple basin rim','cylinder',[0,.1,9],[7,.6,5],'#788d83'),
    object('common-pool','Traveling ripples','cylinder',[0,.43,9],[6.4,.12,4.4],'#50a7a4',{shaderId:shaders.water}),
  ];
  for (const [i,x] of [-8,8].entries()) {
    common.push(object(`common-plinth-${i}`,'Sculpture plinth','cylinder',[x,.2,-6],[3.6,.8,3.6],'#a8b7a2'));
    common.push(object(`common-crystal-${i}`,'Levitating jade sculpture','cone',[x,3.4,-6],[2.4,3.4,2.4],'#7fcebd',{shaderId:shaders.crystal,motion:{kind:'float',amplitude:.8,speed:.7,phase:i*Math.PI}}));
  }
  common.push(...lantern('common-lantern-a',-7,7,0),...lantern('common-lantern-b',7,7,Math.PI));

  const tidal: Object[] = [
    object('tidal-basin','Tidal basin','cylinder',[0,.15,0],[18,.8,18],'#637f7e'),
    object('tidal-water','Concentric water currents','cylinder',[0,.6,0],[16.8,.15,16.8],'#468f9c',{shaderId:shaders.water}),
    object('tidal-moon','Floating pearl moon','sphere',[0,5.5,0],[3.6,3.6,3.6],'#d6e7d4',{motion:{kind:'float',amplitude:1,speed:.55,phase:0}}),
  ];
  for(let i=0;i<8;i++) {
    const angle=i*Math.PI/4;
    tidal.push(object(`tidal-stone-${i}`,'Basin stepping stone','cylinder',[Math.cos(angle)*10.5,.2,Math.sin(angle)*10.5],[1.5,.6,1.5],'#b2bbaa'));
  }
  tidal.push(...lantern('tidal-lantern-a',-10,-10,0),...lantern('tidal-lantern-b',10,-10,Math.PI));

  const solar: Object[] = [
    object('solar-base','Sun engine dais','cylinder',[0,.1,0],[13,.8,13],'#a28c68'),
    object('solar-step','Sun engine upper step','cylinder',[0,.65,0],[9,.4,9],'#d5bd8c'),
    object('solar-column','Axle','cylinder',[0,3,0],[.7,5,.7],'#8d7552'),
    object('solar-sun','Suspended amber sun','sphere',[0,7,0],[3.8,3.8,3.8],'#f7cf79',{shaderId:shaders.light,motion:{kind:'float',amplitude:.5,speed:.6,phase:0}}),
  ];
  for(let i=0;i<3;i++) solar.push(object(`solar-vane-${i}`,'Rotating solar vane','box',[0,2+i*.9,0],[10-i*1.6,.22,.8],'#e4bd72',{motion:{kind:'spin',speed:.35+i*.12,phase:i*Math.PI/3}}));
  for(let i=0;i<12;i++) {
    const angle=i*Math.PI/6;
    solar.push(object(`solar-hour-${i}`,'Hour stone','box',[Math.cos(angle)*9,.4,Math.sin(angle)*9],[.8,1.2,.8],'#c4aa7e',{yaw:angle}));
  }
  solar.push(...lantern('solar-lantern-a',-10,-10,0),...lantern('solar-lantern-b',10,-10,Math.PI));
  return [
    {id:'plot-1-1',name:'Common Future',objects:common},
    {id:'plot-2-1',name:'Tidal Chamber',objects:tidal},
    {id:'plot-1-2',name:'Sun Engine',objects:solar},
  ];
}
