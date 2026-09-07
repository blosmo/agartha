import {expect,it} from 'vitest';
import {PNG} from 'pngjs';
import {deflateSync} from 'node:zlib';
import {decodeNodeImage} from './nodeImages';
it('decodes ordinary embedded PNG pixels',async()=>{const png=new PNG({width:1,height:1});png.data.set([10,20,30,255]);const image=await decodeNodeImage(new Blob([new Uint8Array(PNG.sync.write(png))]));expect([...image.data]).toEqual([10,20,30,255]);});
it('bounds Adam7 inflation before passing untrusted chunks to the decoder',async()=>{
 const chunk=(name:string,data:Buffer)=>{const output=Buffer.alloc(data.length+12);output.writeUInt32BE(data.length,0);output.write(name,4);data.copy(output,8);return output;};
 const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;header[12]=1;
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(1_000_000))),chunk('IEND',Buffer.alloc(0))]);
 await expect(decodeNodeImage(new Blob([bytes]))).rejects.toThrow();
});
