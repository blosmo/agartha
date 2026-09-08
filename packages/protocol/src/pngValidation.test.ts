import {expect,it} from 'vitest';
import {zlibSync} from 'fflate';
import {validatePngPreview} from './pngValidation';
function concat(...parts:Uint8Array[]){const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;}
function chunk(kind:string,bytes:Uint8Array){const result=new Uint8Array(bytes.length+12),view=new DataView(result.buffer);view.setUint32(0,bytes.length);result.set(new TextEncoder().encode(kind),4);result.set(bytes,8);let crc=0xffffffff;for(const value of result.subarray(4,result.length-4)){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}view.setUint32(result.length-4,(crc^0xffffffff)>>>0);return result;}
function png(raw:Uint8Array,{width=1,height=1,depth=8,color=6,interlace=0,compressed=zlibSync(raw)}={}){const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header.set([depth,color,0,0,interlace],8);return concat(new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...(color===3?[chunk('PLTE',new Uint8Array([255,128,32]))]:[]),chunk('IDAT',compressed),chunk('IEND',new Uint8Array()));}
it('accepts RGB/RGBA Blender export scanlines and all PNG bit-depth/color families',()=>{
 for(const [color,depth,channels]of [[0,1,1],[0,16,1],[2,8,3],[2,16,3],[3,1,1],[4,8,2],[4,16,2],[6,8,4],[6,16,4]])expect(()=>validatePngPreview(png(new Uint8Array(1+Math.ceil(depth*channels/8)),{color,depth}))).not.toThrow();
 expect(()=>validatePngPreview(png(new Uint8Array([0,12,24,36,255]),{interlace:1}))).not.toThrow();
});
it('rejects corrupted CRCs, including a one-byte change in the IDAT payload',()=>{
 const bytes=png(new Uint8Array([0,1,2,3,255]));bytes[41]^=255;expect(()=>validatePngPreview(bytes)).toThrow();
});
it('rejects invalid deflate, checksum, filter, truncation and extra decoded data even with recomputed PNG CRCs',()=>{
 const raw=new Uint8Array([0,1,2,3,255]),compressed=zlibSync(raw);
 const invalidDeflate=compressed.slice();invalidDeflate[2]=255;
 const invalidChecksum=compressed.slice();invalidChecksum[invalidChecksum.length-1]^=1;
 for(const stream of [invalidDeflate,invalidChecksum,compressed.subarray(0,compressed.length-1)])expect(()=>validatePngPreview(png(raw,{compressed:stream}))).toThrow();
 expect(()=>validatePngPreview(png(new Uint8Array([5,1,2,3,255])))).toThrow();
 expect(()=>validatePngPreview(png(new Uint8Array([0,1,2,3])))).toThrow();
 expect(()=>validatePngPreview(png(new Uint8Array(1_000_000)))).toThrow();
});
it('accepts valid chunk-split zlib streams',()=>{
 const raw=new Uint8Array([0,1,2,3,255]),compressed=zlibSync(raw),whole=png(raw),header=whole.subarray(0,33);
 const split=concat(header,chunk('IDAT',compressed.subarray(0,3)),chunk('IDAT',compressed.subarray(3)),chunk('IEND',new Uint8Array()));expect(()=>validatePngPreview(split)).not.toThrow();
});
