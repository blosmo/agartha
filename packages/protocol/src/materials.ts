import {SURFACE_EXAMPLES} from './surfaceShaders.js';
export type PbrMaterial = {
  id:string; name:string; category:string; description:string; color:string; roughness:number; metalness:number;
  maps?: { albedo:string; normal:string; arm:string }; source:string; license:string;
};
function scanned(id:string,name:string,category:string,description:string,asset:string):PbrMaterial {
  const base=`/materials/${asset}`;
  return {id,name,category,description,color:'#ffffff',roughness:1,metalness:1,maps:{albedo:`${base}/albedo.png`,normal:`${base}/normal.png`,arm:`${base}/arm.png`},source:`https://polyhaven.com/a/${asset}`,license:'CC0-1.0'};
}
export const PBR_MATERIALS: readonly PbrMaterial[] = [
  scanned('pbr-dark-wood','Smoked timber','Wood','Deep grain for shelves, frames and warm interior furniture.','dark_wood'),
  scanned('pbr-rosewood','Rosewood veneer','Wood','Fine figured grain for cabinetry and instrument cases.','rosewood_veneer1'),
  scanned('pbr-marble','Veined marble','Stone','Pale mineral veining for basins, plinths and table tops.','marble_01'),
  scanned('pbr-plaster','Mineral plaster','Plaster','A quiet mineral surface for solid architectural objects.','grey_plaster'),
  scanned('pbr-leather','Worn brown leather','Leather','Supple worn leather for seats, books and tool rolls.','brown_leather'),
  scanned('pbr-cotton','Olive woven cotton','Fabric','A subtle olive and indigo weave for quiet upholstery and rugs.','fabric_pattern_05'),
  scanned('pbr-jacquard','Woven jacquard','Fabric','Small woven pattern for cushions, rugs and upholstery.','quatrefoil_jacquard_fabric'),
  scanned('pbr-steel','Weathered steel','Metal','Worked metal with a scanned surface for machinery and fittings.','metal_plate'),
  scanned('pbr-clay','Patterned clay','Clay','Warm textured clay for pots, decorative panels and vessels.','patterned_clay_plaster'),
  {id:'pbr-brass',name:'Satin brass',category:'Metal',description:'Warm reflective metal for mechanisms and small accents.',color:'#c6a05b',roughness:.32,metalness:.88,source:'Agartha',license:'CC0-1.0'},
  {id:'pbr-ceramic',name:'Celadon glaze',category:'Ceramic',description:'A smooth jade glaze for porcelain and small vessels.',color:'#95baaa',roughness:.2,metalness:0,source:'Agartha',license:'CC0-1.0'},
];
const byId=new Map(PBR_MATERIALS.map(material=>[material.id,material]));
export function materialDefinition(id?:string){return id ? byId.get(id) : undefined;}
export function validateMaterialId(id:unknown):string|undefined {
  if(id===undefined)return undefined;
  if(typeof id!=='string'||!byId.has(id))throw new Error('Choose a materialId from /api/materials.');
  return id;
}
/** Portable Blender finishes reuse the bundled maps; generated maps contain no lighting. */
export const BLENDER_FINISHES = [
  {id:'weathered-copper',name:'Weathered copper',baseMaterialId:'pbr-steel',kind:'patina',color:[0.42,0.19,0.075],accent:[0.055,0.27,0.20],roughness:0.38,metalness:0.95,shaderPreset:'Oxidized bronze'},
  {id:'limestone-masonry',name:'Limestone masonry',baseMaterialId:'pbr-plaster',kind:'masonry',color:[0.66,0.60,0.47],accent:[0.31,0.29,0.25],roughness:0.82,metalness:0,shaderPreset:'Mineral bands'},
  {id:'honed-limestone',name:'Honed limestone',baseMaterialId:'pbr-plaster',kind:'mineral',color:[0.66,0.60,0.47],accent:[0.31,0.29,0.25],roughness:0.76,metalness:0,shaderPreset:'Mineral bands'},
  {id:'coastal-rock',name:'Coastal rock',baseMaterialId:'pbr-plaster',kind:'strata',color:[0.22,0.235,0.22],accent:[0.38,0.33,0.25],roughness:0.88,metalness:0,shaderPreset:'Sandstone strata'},
] as const;
export const MATERIAL_CATALOG={entries:PBR_MATERIALS.map(material=>({...material,preview:`/materials/previews/${material.id}.png`})),shaderPresets:SURFACE_EXAMPLES,blenderFinishes:BLENDER_FINISHES,apply:'Set materialId on a raw object edit. Use white object color to preserve the scanned albedo; other colors tint it. Combine with shaderId for procedural color effects.',maps:'1K albedo (sRGB), OpenGL normal (linear), packed ambient occlusion / roughness / metalness (linear).',source:'Scanned maps: Poly Haven, CC0. Bundled locally; no runtime requests to the provider.'};
