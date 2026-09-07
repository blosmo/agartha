import { roomCraft } from './roomCraft';
import { assertWithinPlot } from '../packages/protocol/src/plots';
import type { SharedWorld } from '../apps/web/src/worlds/world';
const origin='http://127.0.0.1:5174';
async function request(path:string,body?:unknown){const res=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});const data=await res.json();if(!res.ok)throw new Error(`${res.status}: ${data.error}`);return data;}
for(const room of roomCraft()){
  room.objects.forEach(object=>assertWithinPlot(object));
  let world:SharedWorld=await request(`/api/plots/${room.id}`);
  for(const object of room.objects){const existing=world.objects.find(o=>o.id===object.id);if(existing&&existing.author!=='Codex')throw new Error(`Preserving another author's object ${object.id}`);}
  for(let i=0;i<room.objects.length;i+=20)world=await request(`/api/plots/${room.id}`,{baseRevision:world.revision,author:'Codex',message:'Furnished the room with crafted furniture, plants and lived-in details.',objects:room.objects.slice(i,i+20)});
  if(world.brief!==room.brief)world=await request(`/api/plots/${room.id}`,{baseRevision:world.revision,author:'Codex',message:'Added the room’s story.',brief:room.brief});
  console.log(`${world.name}: ${room.objects.length} crafted details, ${world.objects.length} total objects.`);
}
