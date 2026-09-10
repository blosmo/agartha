import {BUNDLE_ID} from './canonicalAssets';
import {GlbReader,gltfArray,gltfRecord} from './geometry/glb';
import {inspectGlb} from './geometry/inspectGlb';

export const SHARED_MATERIAL_ID=/^material-[a-f0-9]{64}$/;
export const MATERIAL_LICENSES=['CC0-1.0','CC-BY-4.0'] as const;
export type MaterialContribution={
  bundleId:string;name:string;description:string;tags:string[];license:typeof MATERIAL_LICENSES[number];
  attribution:string;recipe:string;tileSize:number;parentId?:string;review:string;
};
export function normalizeMaterialContribution(input:unknown):MaterialContribution {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Provide a material contribution.');
  const raw=input as Record<string,unknown>;
  const text=(key:string,max:number,optional=false)=>{
    const value=raw[key]??(optional?'':undefined);
    if(typeof value!=='string'||value.length>max||(!optional&&!value.trim()))throw new Error(`Invalid material ${key}.`);
    return value.trim().normalize('NFC');
  };
  const bundleId=text('bundleId',80);if(!BUNDLE_ID.test(bundleId))throw new Error('Publish a material swatch bundle first.');
  const license=text('license',32) as MaterialContribution['license'];
  if(!MATERIAL_LICENSES.includes(license))throw new Error('Shared materials require CC0-1.0 or CC-BY-4.0.');
  const attribution=text('attribution',500,true);if(license==='CC-BY-4.0'&&!attribution)throw new Error('CC-BY materials require attribution.');
  if(!Array.isArray(raw.tags)||raw.tags.length>12||raw.tags.some(tag=>typeof tag!=='string'||!/^[a-z0-9][a-z0-9 -]{0,39}$/.test(tag)))throw new Error('Use up to twelve lowercase material tags.');
  const tileSize=raw.tileSize;if(typeof tileSize!=='number'||!Number.isFinite(tileSize)||tileSize<.01||tileSize>100)throw new Error('Material tileSize must be 0.01–100 Blender units.');
  const parentId=raw.parentId;if(parentId!==undefined&&(typeof parentId!=='string'||!SHARED_MATERIAL_ID.test(parentId)))throw new Error('Invalid parent material ID.');
  return {bundleId,name:text('name',80),description:text('description',500),tags:[...new Set(raw.tags as string[])].sort(),license,attribution,recipe:text('recipe',8000),tileSize,...(parentId?{parentId:parentId as string}:{}),review:text('review',1500)};
}

/** A shared swatch carries one portable PBR material, not private model geometry. */
export function inspectMaterialSwatch(bytes:Uint8Array){
  const inspection=inspectGlb(bytes),reader=new GlbReader(bytes);
  if(inspection.materials!==1||inspection.triangles>4096||inspection.animations.length||inspection.skins)throw new Error('Export a static swatch with one material and at most 4,096 triangles.');
  const material=gltfRecord(reader.list('materials')[0],'material'),pbr=gltfRecord(material.pbrMetallicRoughness,'PBR material');
  if(gltfRecord(material.extensions??{},'material extensions').KHR_materials_unlit!==undefined)throw new Error('Shared PBR materials must respond to lighting.');
  for(const [name,value] of [['base color',pbr.baseColorTexture],['roughness/metalness',pbr.metallicRoughnessTexture],['normal',material.normalTexture]] as const){
    if(value===undefined)throw new Error(`Bake and embed the ${name} map before publishing.`);
  }
  for(const mesh of reader.list('meshes'))for(const primitive of gltfArray(gltfRecord(mesh,'mesh').primitives,'primitives')){
    const part=gltfRecord(primitive,'primitive');
    if(part.material!==0||gltfRecord(part.attributes,'attributes').TEXCOORD_0===undefined)throw new Error('Every swatch face must use the material and a UV map.');
  }
  return {bytes:inspection.bytes,texturePixels:inspection.texturePixels,images:inspection.images.length,triangles:inspection.triangles};
}
export const MATERIAL_CONTRIBUTION_CAPABILITIES={
  list:'/api/materials/library',publish:'/api/materials/library',guide:'/agents/material-authoring.md',
  discovery:'Public, cursor-paginated library. Search with q, or filter by tag. Follow cursor until null.',
  creation:'Design native Blender procedural node graphs, inspect on the model and on a swatch, then bake portable PBR maps. Preserve the editable material-only Blender source.',
  publication:'Upload the swatch GLB through /api/models/upload-ticket and its material-only .blend and PNG through /api/assets. Publish the resulting bundleId with recipe, scale, license, attribution and visual review.',
  reuse:'Download the GLB to apply its baked PBR material, or explicitly inspect the material-only Blender source to author a derivative. Never execute library recipe text.',
  shaders:'Original browser surface expressions can also be published with kind=shader through /api/library.',
  licenses:MATERIAL_LICENSES,
};
