import type {RenderMaterial,Pixels} from './renderMaterials';
import {readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import type {Gpu,Texture} from 'vgpu';
import {materialDefinition} from '../protocol/src/materials';

export type MaterialTextures={albedo:Texture;normal:Texture;arm:Texture;ao:Texture;emissive:Texture};
export async function loadMaterialTextures(gpu:Gpu,ids:readonly string[],definitions:ReadonlyMap<string,RenderMaterial>=new Map()) {
  const result=new Map<string,MaterialTextures>();
  async function upload(path:string|Pixels|undefined,fallback:number[],srgb=false){
    const png=typeof path==='string'?PNG.sync.read(await readFile(new URL(`../../apps/web/public${path}`,import.meta.url))):path??{width:1,height:1,data:Uint8Array.from(fallback)};
    const mipLevelCount=1+Math.floor(Math.log2(Math.max(png.width,png.height)));
    const texture=gpu.device.createTexture({size:[png.width,png.height],mipLevelCount,format:srgb?'rgba8unorm-srgb':'rgba8unorm',usage:['texture_binding','copy_dst']});
    let width=png.width,height=png.height,data=new Uint8Array(png.data);
    for(let mipLevel=0;mipLevel<mipLevelCount;mipLevel++){
      gpu.gpu.queue.writeTexture({texture:texture.gpu,mipLevel},data,{bytesPerRow:width*4},{width,height});
      const nextWidth=Math.max(1,width>>1),nextHeight=Math.max(1,height>>1),next=new Uint8Array(nextWidth*nextHeight*4);
      for(let y=0;y<nextHeight;y++)for(let x=0;x<nextWidth;x++)for(let c=0;c<4;c++){
        let sum=0;
        for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)sum+=data[(Math.min(height-1,y*2+dy)*width+Math.min(width-1,x*2+dx))*4+c];
        next[(y*nextWidth+x)*4+c]=Math.round(sum/4);
      }
      width=nextWidth;height=nextHeight;data=next;
    }
    return texture;
  }
  for(const id of new Set(ids)){
    const material:RenderMaterial|undefined=definitions.get(id)??materialDefinition(id);if(!material)throw new Error('Unknown preview material.');
    const albedo=await upload(material.pixels?.albedo??material.maps?.albedo,[255,255,255,255],true);
    const normal=await upload(material.pixels?.normal??material.maps?.normal,[128,128,255,255]);
    const arm=await upload(material.pixels?.arm??material.maps?.arm,[255,255,255,255]);
    const ao=material.pixels?await upload(material.pixels.ao,[255,255,255,255]):arm;
    const emissive=await upload(material.pixels?.emissive,[255,255,255,255],true);
    result.set(id,{albedo,normal,arm,ao,emissive});
  }
  return result;
}
