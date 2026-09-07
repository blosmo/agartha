import {mkdir,writeFile} from 'node:fs/promises';
import {PBR_MATERIALS} from '../packages/protocol/src/materials';
import {renderWorldPng} from '../packages/renderer/render';
const root=new URL('../apps/web/public/materials/previews/',import.meta.url);await mkdir(root,{recursive:true});
for(const material of PBR_MATERIALS){
  const result=await renderWorldPng([{id:'sample',name:material.name,shape:'sphere',position:[0,0,0],scale:[8,8,8],color:'#ffffff',materialId:material.id}],256,256);
  await writeFile(new URL(`${material.id}.png`,root),result.png);
  console.log(material.name);
}
