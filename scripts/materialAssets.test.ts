import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {PNG} from 'pngjs';
import {PBR_MATERIALS} from '../packages/protocol/src/materials';
it('ships verified local 1K maps and render previews for every scanned material',async()=>{
 const root=new URL('../apps/web/public/',import.meta.url);
 const sources=JSON.parse(await readFile(new URL('materials/sources.json',root),'utf8'));
 for(const material of PBR_MATERIALS){
   const preview=PNG.sync.read(await readFile(new URL(`materials/previews/${material.id}.png`,root)));expect(preview.width).toBe(256);
   if(!material.maps)continue;
   const source=sources.find((s:{source:string})=>s.source===material.source);expect(source.license).toBe('CC0-1.0');
   for(const [channel,path]of Object.entries(material.maps)){
    const bytes=await readFile(new URL(path.slice(1),root));const png=PNG.sync.read(bytes);
    expect(Math.min(png.width,png.height)).toBe(1024);expect(Math.max(png.width,png.height)).toBeLessThanOrEqual(1100);expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.maps[channel].sha256);
   }
 }
},20000);
