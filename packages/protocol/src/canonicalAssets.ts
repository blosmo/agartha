import {validatePngPreview} from './pngValidation.js';
import {MODEL_ID} from './modelAssets.js';
export const BUNDLE_ID=/^bundle-[a-f0-9]{64}$/;
export const ASSET_LIMITS={source:16_000_000,preview:2_000_000,agentBytes:128_000_000,agentCount:64,tickets:2,ticketMs:300_000,graceMs:300_000} as const;
export type ArtifactRole='source'|'preview';
export type ArtifactDescriptor={sha256:string;bytes:number};
export type CanonicalMetadata={name:string;description?:string;license?:string;attribution?:string;parentId?:string};
export function normalizeAssetMetadata(input:CanonicalMetadata):CanonicalMetadata {
 const result:CanonicalMetadata={name:input.name.trim().normalize('NFC')};
 for(const key of ['description','license','attribution','parentId'] as const){const value=input[key]?.trim().normalize('NFC');if(value)result[key]=value;}
 if(!result.name||result.name.length>80||(result.description?.length??0)>500||(result.license?.length??0)>80||(result.attribution?.length??0)>500||(result.parentId&&!BUNDLE_ID.test(result.parentId)))throw new Error('Invalid canonical asset metadata.');
 return result;
}
export function validateArtifactDescriptor(role:ArtifactRole,value:ArtifactDescriptor){if(!/^[a-f0-9]{64}$/.test(value.sha256)||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>ASSET_LIMITS[role])throw new Error('Invalid artifact hash or size.');}
export function canonicalAssetIdentity(creatorAgentId:string,modelId:string,metadata:CanonicalMetadata,source:ArtifactDescriptor,preview:ArtifactDescriptor){
 if(!creatorAgentId||!MODEL_ID.test(modelId))throw new Error('Invalid canonical asset identity.');
 validateArtifactDescriptor('source',source);validateArtifactDescriptor('preview',preview);
 return JSON.stringify({version:1,creatorAgentId,modelId,metadata:normalizeAssetMetadata(metadata),source:{sha256:source.sha256,bytes:source.bytes},preview:{sha256:preview.sha256,bytes:preview.bytes}});
}
export function validateArtifactSignature(role:ArtifactRole,bytes:Uint8Array){
 if(role==='source'){
  if(bytes.length<12||new TextDecoder().decode(bytes.subarray(0,7))!=='BLENDER'||![45,95].includes(bytes[7])||![118,86].includes(bytes[8])||!/^\d{3}$/.test(new TextDecoder().decode(bytes.subarray(9,12))))throw new Error('Expected an uncompressed Blender source file.');
 }else validatePngPreview(bytes);
}
export const artifactContentType=(role:ArtifactRole)=>role==='source'?'application/x-blender':'image/png';
export const markedArtifactContentType=(role:ArtifactRole)=>`${artifactContentType(role)};agartha-canonical=1`;
