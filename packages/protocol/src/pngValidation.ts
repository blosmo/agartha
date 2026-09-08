import {Unzlib} from 'fflate';
const crcTable=Uint32Array.from({length:256},(_,value)=>{let crc=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);return crc>>>0;});
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const value of bytes)crc=(crc>>>8)^crcTable[(crc^value)&255];return (crc^0xffffffff)>>>0;}
function invalid():never {throw new Error('Expected a valid PNG preview no larger than 2048 by 2048 pixels.');}
/** Validate PNG framing and bounded scanline data without allocating a decoded image. */
export function validatePngPreview(bytes:Uint8Array){
 if(bytes.length<57||bytes.length>2_000_000||![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))invalid();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder();
 if(view.getUint32(8)!==13||decoder.decode(bytes.subarray(12,16))!=='IHDR')invalid();
 const width=view.getUint32(16),height=view.getUint32(20),depth=bytes[24],color=bytes[25];
 if(width<1||height<1||width>2048||height>2048||width*height>4_194_304)invalid();
 const depths:Record<number,number[]>={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
 if(!depths[color]?.includes(depth)||bytes[26]!==0||bytes[27]!==0||bytes[28]>1)invalid();
 let offset=8,hasData=false,dataEnded=false,hasPalette=false,chunks=0,ended=false,compressedSize=0;
 const data:Uint8Array[]=[];
 while(offset<bytes.length){
  if(bytes.length-offset<12||++chunks>4096)invalid();
  const length=view.getUint32(offset),kind=decoder.decode(bytes.subarray(offset+4,offset+8)),end=offset+12+length;
  if(end>bytes.length||!/^[A-Za-z]{4}$/.test(kind)||crc32(bytes.subarray(offset+4,end-4))!==view.getUint32(end-4))invalid();
  if(kind==='IHDR'&&offset!==8)invalid();
  if(kind==='PLTE'){if(hasData||hasPalette||color===0||color===4||length===0||length>768||length%3!==0||(color===3&&length/3>2**depth))invalid();hasPalette=true;}
  if(kind==='IDAT'){if(dataEnded||(color===3&&!hasPalette))invalid();hasData=true;data.push(bytes.subarray(offset+8,end-4));compressedSize+=length;}
  else if(hasData)dataEnded=true;
  if(kind==='IEND'){if(length!==0||!hasData||end!==bytes.length)invalid();ended=true;break;}
  if(!['IHDR','PLTE','IDAT'].includes(kind)&&kind[0]===kind[0].toUpperCase())invalid();
  offset=end;
 }
 if(!ended||compressedSize<6)invalid();
 const compressed=new Uint8Array(compressedSize);let position=0;for(const chunk of data){compressed.set(chunk,position);position+=chunk.length;}
 // PNG forbids preset dictionaries. fflate checks the remaining zlib header fields.
 if(compressed[1]&32)invalid();
 const channels:Record<number,number>={0:1,2:3,3:1,4:2,6:4};
 const bitsPerPixel=channels[color]*depth;
 const passes=bytes[28]===0?[[0,0,1,1]]:[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
 const filterPositions=new Set<number>();let expectedSize=0;
 for(const [x,y,dx,dy]of passes){const passWidth=Math.max(0,Math.ceil((width-x)/dx)),passHeight=Math.max(0,Math.ceil((height-y)/dy));if(!passWidth||!passHeight)continue;const rowBytes=Math.ceil(passWidth*bitsPerPixel/8)+1;for(let row=0;row<passHeight;row++){filterPositions.add(expectedSize);expectedSize+=rowBytes;}}
 let decodedSize=0,adlerA=1,adlerB=0,finished=false;
 const stream=new Unzlib((chunk,final)=>{
  if(decodedSize+chunk.length>expectedSize)invalid();
  for(const value of chunk){if(filterPositions.has(decodedSize)&&value>4)invalid();decodedSize++;adlerA=(adlerA+value)%65521;adlerB=(adlerB+adlerA)%65521;}
  finished=final;
 });
 // A 256-byte compressed input bounds each inflate burst before the output quota check.
 try{for(let start=0;start<compressed.length;start+=256)stream.push(compressed.subarray(start,Math.min(start+256,compressed.length)),start+256>=compressed.length);}catch{invalid();}
 const checksum=new DataView(compressed.buffer).getUint32(compressed.length-4);
 if(!finished||decodedSize!==expectedSize||(((adlerB<<16)|adlerA)>>>0)!==checksum)invalid();
}
