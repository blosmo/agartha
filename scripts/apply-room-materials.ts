import {SURFACE_EXAMPLES} from '../packages/protocol/src/surfaceShaders';
import type {SharedWorld,WorldObject} from '../apps/web/src/worlds/world';
const origin='http://127.0.0.1:5174';
async function request(path:string,body?:unknown){const res=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});const data=await res.json();if(!res.ok)throw new Error(`${res.status}: ${data.error}`);return data;}
function material(object:WorldObject){
  const n=object.name.toLowerCase();
  if(/water|ripples|jade sculpture|flame|sun$|pearl moon|tea$|frond|soil/.test(n))return undefined;
  if(/brass|gear|vane|axle|pendulum|hand tool/.test(n))return 'pbr-brass';
  if(/tool roll/.test(n))return 'pbr-leather';
  if(/cushion|linen|rug field/.test(n))return 'pbr-cotton';
  if(/saucer|bowl|teapot|rain jar/.test(n))return 'pbr-ceramic';
  if(/planter/.test(n))return 'pbr-clay';
  if(/stone|plinth|coping|basin|upper step/.test(n))return 'pbr-marble';
  if(/clock case|drawer|table top/.test(n))return 'pbr-rosewood';
  if(/bookcase|bench|table leg|table pedestal|stool|reading table/.test(n))return 'pbr-dark-wood';
  if(/dais|column/.test(n))return 'pbr-plaster';
  return undefined;
}
for(const id of ['plot-1-1','plot-2-1','plot-1-2']){
  let world:SharedWorld=await request(`/api/plots/${id}`);
  const objects=world.objects.filter(object=>object.author==='Codex'&&material(object)).map(object=>({...object,materialId:material(object),color:'#ffffff'}));
  for(let i=0;i<objects.length;i+=20)world=await request(`/api/plots/${id}`,{baseRevision:world.revision,author:'Codex',message:'Refined materials with scanned PBR surfaces, satin brass and celadon glaze.',objects:objects.slice(i,i+20)});
  console.log(`${world.name}: ${objects.length} furnished objects now use PBR materials.`);
}
for(const shader of SURFACE_EXAMPLES)await request('/api/library',{plotId:'plot-1-1',author:'Agartha material library',definition:{kind:'shader',...shader,description:'A validated procedural surface. Combine with a PBR material and inspect it in your room.'}});
const room:SharedWorld=await request('/api/plots/plot-1-1');
for(const [name,names] of [
  ['Walnut reading bench',['Walnut bench seat','Bench foot','Linen seat cushion','Low bench back']],
  ['Clothbound bookcase',['Walnut bookcase stile','Bookcase backing','Bookcase shelf','Clothbound volume','Bookcase cornice']],
  ['Fern planter',['Glazed planter','Dark soil','Fern frond']],
] as const){
  let objects=room.objects.filter(object=>(names as readonly string[]).includes(object.name));
  // Select one complete assembly; the room contains multiple benches and plants.
  if(name==='Walnut reading bench')objects=objects.slice(0,5);
  if(name==='Fern planter')objects=objects.slice(0,7);
  const entry=await request('/api/library',{plotId:room.id,author:'Agartha furnishing library',definition:{kind:'asset',name,description:'A crafted reusable furnishing with PBR materials. Adapt placement to your room composition.',objects}});
  console.log(`${name}: ${entry.id}`);
}
