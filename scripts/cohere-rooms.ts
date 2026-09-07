import {roomCraft} from './roomCraft';
import type {SharedWorld,WorldObject} from '../apps/web/src/worlds/world';
import {assertWithinPlot} from '../packages/protocol/src/plots';
const origin='http://127.0.0.1:5174';
async function request(path:string,body?:unknown){const res=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});const data=await res.json();if(!res.ok)throw new Error(`${res.status}: ${data.error}`);return data;}
const plans=[
 {id:'plot-1-1',brief:'A rain-washed tea courtyard. The existing pavilion is the shelter and focal point; a low tea setting and quiet seating form one gathering area. Glazed planters mark its edges, with an open approach through the room.',remove:(o:WorldObject)=>/Bookcase|bookcase|Clothbound|Sculpture plinth|Levitating jade|River stone at sculpture|Ripple basin|Traveling ripples|Path to tea/.test(o.name)},
 {id:'plot-2-1',brief:'A lunar bathing sanctuary. Everything faces the single floating moon and circular pool: stone coping, a quiet ring of stepping stones, paired resting benches and candles. The open center and restrained jade-and-stone palette keep the water dominant.',remove:(o:WorldObject)=>/Bookcase|bookcase|Clothbound|reading table|Table pedestal|Open folio/.test(o.name)},
 {id:'plot-1-2',brief:'A clockmaker’s working observatory. The rotating brass sun engine is the mechanism under repair. A tool-covered workbench, parts drawers and a pendulum clock form the service area behind it; the front remains open for studying the moving vanes.',remove:(o:WorldObject)=>/Bookcase|bookcase|Clothbound|Glazed planter|Dark soil|Fern frond|Walnut bench|Bench foot|Linen seat cushion|Low bench back/.test(o.name)},
];
for(const plan of plans){
 let world:SharedWorld=await request(`/api/plots/${plan.id}`);
 const remove=world.objects.filter(o=>o.author==='Codex'&&plan.remove(o)).map(o=>o.id);
 for(let i=0;i<remove.length;i+=50)world=await request(`/api/plots/${plan.id}`,{baseRevision:world.revision,author:'Codex',message:'Removed furnishings that competed with the room’s main activity.',remove:remove.slice(i,i+50)});
 const updates:WorldObject[]=[];
 const baseline=new Map(roomCraft().find(room=>room.id===plan.id)!.objects.map(o=>[o.id,o]));
 if(plan.id==='plot-1-1'){
  for(const object of world.objects.filter(o=>/Pavilion roof|Pavilion column|Gathering table/.test(o.name))){const {shaderId,...rest}=object;updates.push({...rest,materialId:'pbr-dark-wood',color:'#ffffff'});}
  // Move the entire tea cluster toward the pavilion; its rug binds the furniture together.
  for(const o of world.objects.filter(o=>o.author==='Codex')){
   const original=baseline.get(o.id);
   if(original&&original.position[0]<-4&&original.position[0]>-12&&original.position[2]>=0&&original.position[2]<=6&& !/lantern/i.test(o.name))updates.push({...o,position:[original.position[0]+1,original.position[1],original.position[2]+1]});
  }
 }
 if(plan.id==='plot-2-1'){
  // A second resting alcove balances the pool; no unrelated library or work furniture.
  const bench=world.objects.filter(o=>o.author==='Codex'&&o.id.startsWith('craft-')&&/Walnut bench seat|Bench foot|Linen seat cushion|Low bench back/.test(o.name));
  for(const o of bench)updates.push({...o,id:`sanctuary-${o.id}`,position:[-o.position[0],o.position[1],o.position[2]],yaw:-(o.yaw??0)});
 }
 if(plan.id==='plot-1-2'){
  // Bring loose parts storage into the workbench/clock cluster instead of scattering it in front.
  for(const o of world.objects.filter(o=>o.author==='Codex'&&/Parts cabinet drawer|Brass drawer pull/.test(o.name)))updates.push({...o,position:[(baseline.get(o.id)?.position[0]??11)-14,o.position[1],(baseline.get(o.id)?.position[2]??-4)-5]});
 }
 updates.forEach(o=>assertWithinPlot(o));
 if(updates.length)world=await request(`/api/plots/${plan.id}`,{baseRevision:world.revision,author:'Codex',message:'Composed furnishings around a single focal point and functional zone.',objects:updates});
 if(world.brief!==plan.brief)world=await request(`/api/plots/${plan.id}`,{baseRevision:world.revision,author:'Codex',message:'Clarified the room’s purpose after recomposing its contents.',brief:plan.brief});
 console.log(`${world.name}: removed ${remove.length}, recomposed ${updates.length}, ${world.objects.length} total.`);
}
