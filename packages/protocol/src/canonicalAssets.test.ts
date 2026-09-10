import {expect,it} from 'vitest';
import {canonicalAssetIdentity,normalizeAssetMetadata,validateArtifactDescriptor,validateArtifactSignature} from './canonicalAssets';
const source={sha256:'a'.repeat(64),bytes:12},preview={sha256:'b'.repeat(64),bytes:70},model=`model-${'c'.repeat(64)}`;
it('normalizes metadata in a stable, versioned identity including creator and editable content',()=>{
 const make=(author='agent',s=source)=>canonicalAssetIdentity(author,model,{name:' Name ',description:'',license:'CC0'},s,preview);
 expect(make()).toBe(canonicalAssetIdentity('agent',model,{license:'CC0',name:'Name'},source,preview));
 expect(make()).not.toBe(make('other'));expect(make()).not.toBe(make('agent',{...source,sha256:'d'.repeat(64)}));expect(JSON.parse(make()).version).toBe(1);
});
it('rejects invalid metadata, hashes, sizes and artifact signatures',()=>{
 expect(()=>normalizeAssetMetadata({name:' '})).toThrow();expect(()=>normalizeAssetMetadata({name:'ok',parentId:'asset-procedural'})).toThrow();
 for(const bytes of [0,NaN,1.5,16_000_001])expect(()=>validateArtifactDescriptor('source',{...source,bytes})).toThrow();
 expect(()=>validateArtifactSignature('source',new TextEncoder().encode('BLENDER-v300'))).not.toThrow();
 expect(()=>validateArtifactSignature('source',new TextEncoder().encode('BLENDERxxx00'))).toThrow();expect(()=>validateArtifactSignature('preview',new Uint8Array(40))).toThrow();
});
it('bounds preview dimensions and requires complete ordered PNG chunks',()=>{
 const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNocFD4DwAEBAHgAJsDCwAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
 expect(()=>validateArtifactSignature('preview',png)).not.toThrow();
 for(const dimension of [0,2049,0xffffffff]){const bad=png.slice();new DataView(bad.buffer).setUint32(16,dimension);expect(()=>validateArtifactSignature('preview',bad)).toThrow();}
 expect(()=>validateArtifactSignature('preview',png.subarray(0,33))).toThrow();
 expect(()=>validateArtifactSignature('preview',png.subarray(0,png.length-12))).toThrow();
 const oversizedChunk=png.slice();new DataView(oversizedChunk.buffer).setUint32(33,0xffffffff);expect(()=>validateArtifactSignature('preview',oversizedChunk)).toThrow();
 const trailing=new Uint8Array(png.length+1);trailing.set(png);expect(()=>validateArtifactSignature('preview',trailing)).toThrow();
});

it('accepts Blender 5 format-1 headers and rejects malformed or truncated variants',()=>{
 const encode=(text:string)=>new TextEncoder().encode(text);
 for(const header of ['BLENDER17-01v0500','BLENDER17-01v0502'])expect(()=>validateArtifactSignature('source',encode(header))).not.toThrow();
 for(const header of ['BLENDER17-01v050','BLENDER18-01v0502','BLENDER17-02v0502','BLENDER17-01V0502','BLENDER17-01vABCD','BLENDER17xxx0502'])expect(()=>validateArtifactSignature('source',encode(header))).toThrow();
});
