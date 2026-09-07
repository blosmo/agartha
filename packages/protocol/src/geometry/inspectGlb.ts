import {GLB_LIMITS,GlbReader,gltfArray,gltfRecord,gltfIndex,gltfInteger} from './glb';
import {glbImages} from './glbImages';
export type GlbInspection={bytes:number;texturePixels:number;vertices:number;triangles:number;draws:number;nodes:number;materials:number;images:ReturnType<typeof glbImages>;skins:number;morphTargets:number;animations:Array<{name:string;duration:number;channels:number}>};
function vector(value:unknown,length:number,label:string,fallback:number[]):number[]{if(value===undefined)return fallback;if(!Array.isArray(value)||value.length!==length||!value.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6))throw new Error(`Invalid ${label}.`);return value;}
/** Inspect before storage/loading. Never fetch resource URLs or execute extension code. */
export function inspectGlb(bytes:Uint8Array):GlbInspection {
 const reader=new GlbReader(bytes),json=reader.json;
 const allowed=new Set(['KHR_materials_unlit','KHR_texture_transform']);
 for(const name of gltfArray(json.extensionsRequired,'required extensions'))if(typeof name!=='string'||!allowed.has(name))throw new Error(`Unsupported required glTF extension: ${String(name)}.`);
 for(const name of gltfArray(json.extensionsUsed,'used extensions'))if(['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_meshopt_compression','KHR_texture_basisu','EXT_mesh_gpu_instancing','KHR_animation_pointer'].includes(String(name)))throw new Error(`Unsupported glTF decoding or instancing extension: ${String(name)}.`);
 const nodes=reader.list('nodes').map(n=>gltfRecord(n,'node')),meshes=reader.list('meshes'),materials=reader.list('materials'),textures=reader.list('textures'),samplers=reader.list('samplers'),skins=reader.list('skins');
 if(nodes.length>GLB_LIMITS.nodes)throw new Error('Model has too many nodes.');
 if(materials.length>64||textures.length>32||samplers.length>32)throw new Error('Model exceeds its material/texture binding budget.');
 const images=glbImages(reader);
 const textureBindings=new Set<string>();let texturePixels=0;
 for(const raw of textures){const texture=gltfRecord(raw,'texture');const source=gltfIndex(texture.source,images,'texture source');if(texture.sampler!==undefined)gltfIndex(texture.sampler,samplers,'texture sampler');const binding=`${source}:${texture.sampler??'default'}`;if(!textureBindings.has(binding)){textureBindings.add(binding);texturePixels+=images[source].width*images[source].height;}if(texturePixels>8_388_608)throw new Error('Model exceeds its texture binding memory budget.');}
 for(const raw of samplers){const s=gltfRecord(raw,'sampler');for(const [key,allowed]of [['magFilter',[9728,9729]],['minFilter',[9728,9729,9984,9985,9986,9987]]] as const)if(s[key]!==undefined&&!allowed.some(value=>value===s[key]))throw new Error('Invalid texture filtering.');for(const key of ['wrapS','wrapT'])if(s[key]!==undefined&&![33071,33648,10497].includes(Number(s[key])))throw new Error('Invalid texture wrapping.');}
 const textureInfo=(raw:unknown)=>{if(raw===undefined)return;const info=gltfRecord(raw,'material texture');gltfIndex(info.index,textures,'material texture index');gltfInteger(info.texCoord??0,'texture coordinate set',0,1);};
 for(const raw of materials){
  const material=gltfRecord(raw,'material'),pbr=material.pbrMetallicRoughness===undefined?{}:gltfRecord(material.pbrMetallicRoughness,'PBR material');
  const color=vector(pbr.baseColorFactor,4,'base color',[1,1,1,1]);if(color.some(n=>n<0||n>1))throw new Error('Base color factors must be 0–1.');
  for(const key of ['metallicFactor','roughnessFactor'])if(pbr[key]!==undefined&&(typeof pbr[key]!=='number'||pbr[key]<0||pbr[key]>1))throw new Error('PBR factors must be 0–1.');
  for(const info of [pbr.baseColorTexture,pbr.metallicRoughnessTexture,material.normalTexture,material.occlusionTexture,material.emissiveTexture])textureInfo(info);
  if(material.alphaMode!==undefined&&!['OPAQUE','MASK','BLEND'].includes(String(material.alphaMode)))throw new Error('Invalid alpha mode.');
 }
 let vertices=0,uniqueTriangles=0,primitiveCount=0,morphTargets=0;
 const meshStats=meshes.map(raw=>{
  const mesh=gltfRecord(raw,'mesh'),primitives=gltfArray(mesh.primitives,'primitives');if(!primitives.length)throw new Error('A glTF mesh needs primitives.');
  let triangles=0;
  for(const rawPrimitive of primitives){
   if(++primitiveCount>GLB_LIMITS.primitives)throw new Error('Model has too many primitives.');
   const primitive=gltfRecord(rawPrimitive,'primitive'),attributes=gltfRecord(primitive.attributes,'attributes'),positionInfo=reader.accessorInfo(attributes.POSITION);
   if(positionInfo.type!=='VEC3'||positionInfo.componentType!==5126)throw new Error('Positions must be float VEC3 accessors.');
   const positions=reader.accessor(attributes.POSITION),count=positions.length/3;vertices+=count;
   for(const [name,index]of Object.entries(attributes)){
    const info=reader.accessorInfo(index),data=reader.accessor(index);
    if(info.count!==count||!data.length)throw new Error('Primitive attribute counts differ.');
    if(name==='NORMAL'&&info.type!=='VEC3'||name==='TANGENT'&&info.type!=='VEC4'||name.startsWith('TEXCOORD_')&&info.type!=='VEC2'||name.startsWith('JOINTS_')&&info.type!=='VEC4'||name.startsWith('WEIGHTS_')&&info.type!=='VEC4')throw new Error('Invalid primitive attribute dimensions.');
   }
   const mode=primitive.mode??4;if(![4,5,6].includes(Number(mode)))throw new Error('Import triangle, triangle-strip or triangle-fan geometry.');
   let elements=count;
   if(primitive.indices!==undefined){const info=reader.accessorInfo(primitive.indices);if(info.type!=='SCALAR'||![5121,5123,5125].includes(Number(info.componentType)))throw new Error('Invalid triangle index accessor.');const indices=reader.accessor(primitive.indices);if(indices.some(n=>n<0||n>=count||!Number.isInteger(n)))throw new Error('Primitive index is outside its vertex array.');elements=indices.length;}
   if(elements<3||mode===4&&elements%3!==0)throw new Error('Invalid triangle topology.');
   triangles+=mode===4?elements/3:elements-2;
   if(primitive.material!==undefined)gltfIndex(primitive.material,materials,'primitive material');
   const targets=gltfArray(primitive.targets,'morph targets');if(targets.length>8)throw new Error('Use at most eight morph targets per primitive.');morphTargets+=targets.length;
   for(const target of targets)for(const [name,index]of Object.entries(gltfRecord(target,'morph target'))){const info=reader.accessorInfo(index);if(!['POSITION','NORMAL','TANGENT'].includes(name)||info.type!=='VEC3'||info.count!==count)throw new Error('Invalid morph target.');reader.accessor(index);}
  }
  uniqueTriangles+=triangles;return {triangles,draws:primitives.length};
 });
 if(uniqueTriangles>GLB_LIMITS.triangles)throw new Error('Model exceeds the triangle budget.');
 const parents=new Array(nodes.length).fill(0),children=nodes.map(node=>gltfArray(node.children,'children').map(child=>gltfIndex(child,nodes,'child node')));
 for(const list of children)for(const child of list)if(++parents[child]>1)throw new Error('A node cannot have multiple parents.');
 const depths=new Map<number,number>(),active=new Set<number>();
 function visit(id:number):number{if(active.has(id))throw new Error('Node hierarchy is cyclic.');const known=depths.get(id);if(known!==undefined)return known;active.add(id);const depth=1+Math.max(0,...children[id].map(child=>visit(child)));if(depth>32)throw new Error('Node hierarchy is too deep.');active.delete(id);depths.set(id,depth);return depth;}
 nodes.forEach((node,id)=>{
  visit(id);
  if(node.matrix!==undefined){const matrix=vector(node.matrix,16,'node matrix',[]);if([3,7,11].some(i=>Math.abs(matrix[i])>1e-8)||Math.abs(matrix[15]-1)>1e-8)throw new Error('Node matrix must be affine.');if(node.translation!==undefined||node.rotation!==undefined||node.scale!==undefined)throw new Error('A node cannot combine matrix and TRS transforms.');}
  else{vector(node.translation,3,'node translation',[0,0,0]);const rotation=vector(node.rotation,4,'node rotation',[0,0,0,1]);if(Math.abs(Math.hypot(...rotation)-1)>.001)throw new Error('Node rotation must be a unit quaternion.');const scale=vector(node.scale,3,'node scale',[1,1,1]);if(scale.some(n=>Math.abs(n)<1e-8))throw new Error('Node scale must be nonzero.');}
  if(node.mesh!==undefined)gltfIndex(node.mesh,meshes,'node mesh');if(node.skin!==undefined)gltfIndex(node.skin,skins,'node skin');
 });
 for(const raw of skins){const skin=gltfRecord(raw,'skin'),joints=gltfArray(skin.joints,'skin joints');if(!joints.length||joints.length>128)throw new Error('Use 1–128 skin joints.');joints.forEach(j=>gltfIndex(j,nodes,'skin joint'));if(new Set(joints).size!==joints.length)throw new Error('Duplicate skin joints.');if(skin.skeleton!==undefined)gltfIndex(skin.skeleton,nodes,'skeleton root');if(skin.inverseBindMatrices!==undefined){const info=reader.accessorInfo(skin.inverseBindMatrices);if(info.type!=='MAT4'||info.componentType!==5126||info.count!==joints.length)throw new Error('Invalid inverse bind matrices.');reader.accessor(skin.inverseBindMatrices);}}
 for(const node of nodes)if(node.skin!==undefined){
  const skin=gltfRecord(skins[node.skin as number],'skin'),joints=gltfArray(skin.joints,'joints'),mesh=gltfRecord(meshes[gltfIndex(node.mesh,meshes,'skinned mesh')],'mesh');
  for(const raw of gltfArray(mesh.primitives,'primitives')){
   const attrs=gltfRecord(gltfRecord(raw,'primitive').attributes,'attributes'),jointInfo=reader.accessorInfo(attrs.JOINTS_0),weightInfo=reader.accessorInfo(attrs.WEIGHTS_0);
   if(jointInfo.type!=='VEC4'||![5121,5123].includes(Number(jointInfo.componentType))||jointInfo.normalized===true||weightInfo.type!=='VEC4')throw new Error('Invalid skin attributes.');
   if(reader.accessor(attrs.JOINTS_0).some(j=>j<0||j>=joints.length||!Number.isInteger(j)))throw new Error('Skin joint index is out of range.');
   if(![5121,5123,5126].includes(Number(weightInfo.componentType))||weightInfo.componentType!==5126&&weightInfo.normalized!==true)throw new Error('Skin weights must be float or normalized unsigned data.');
   const weights=reader.accessor(attrs.WEIGHTS_0);if(weights.some(w=>w<0||w>1))throw new Error('Skin weights must be 0–1.');
   for(let i=0;i<weights.length;i+=4)if(weights[i]+weights[i+1]+weights[i+2]+weights[i+3]<1e-8)throw new Error('A skinned vertex needs nonzero weights.');
  }
 }
 const scenes=reader.list('scenes');if(!scenes.length)throw new Error('GLB needs a scene.');if(scenes.length>16)throw new Error('Model has too many scenes.');for(const rawScene of scenes){const roots=gltfArray(gltfRecord(rawScene,'scene').nodes,'scene roots');roots.forEach(id=>gltfIndex(id,nodes,'scene root'));if(new Set(roots).size!==roots.length)throw new Error('Duplicate scene roots.');}const scene=gltfRecord(scenes[gltfIndex(json.scene??0,scenes,'default scene')],'scene');
 const reachable=new Set<number>();function include(id:number){if(reachable.has(id))return;reachable.add(id);children[id].forEach(include);}
 gltfArray(scene.nodes,'scene roots').forEach(id=>include(gltfIndex(id,nodes,'scene root')));
 let triangles=0,draws=0;for(const id of reachable){const node=nodes[id];if(node.mesh!==undefined){const stats=meshStats[node.mesh as number];triangles+=stats.triangles;draws+=stats.draws;}}
 if(!triangles||triangles>GLB_LIMITS.triangles||draws>GLB_LIMITS.primitives)throw new Error('Scene is empty or exceeds the model rendering budget.');
 const rawAnimations=reader.list('animations');if(rawAnimations.length>GLB_LIMITS.animationClips)throw new Error('Model has too many animation clips.');
 let totalChannels=0;
 const animations=rawAnimations.map((raw,index)=>{
  const animation=gltfRecord(raw,'animation'),samplers=gltfArray(animation.samplers,'animation samplers'),channels=gltfArray(animation.channels,'animation channels');totalChannels+=channels.length;if(totalChannels>GLB_LIMITS.animationChannels)throw new Error('Model has too many animation channels.');
  let duration=0;const targets=new Set<string>();
  for(const rawChannel of channels){
   const channel=gltfRecord(rawChannel,'animation channel'),target=gltfRecord(channel.target,'animation target'),nodeId=gltfIndex(target.node,nodes,'animated node'),path=String(target.path);
   if(!['translation','rotation','scale','weights'].includes(path)||nodes[nodeId].matrix!==undefined)throw new Error('Unsupported animation target.');
   const targetId=`${nodeId}:${path}`;if(targets.has(targetId))throw new Error('An animation targets the same property twice.');targets.add(targetId);
   const sampler=gltfRecord(samplers[gltfIndex(channel.sampler,samplers,'animation sampler')],'animation sampler'),interpolation=sampler.interpolation??'LINEAR';if(!['LINEAR','STEP','CUBICSPLINE'].includes(String(interpolation)))throw new Error('Unsupported animation interpolation.');
   const times=reader.accessor(sampler.input),input=reader.accessorInfo(sampler.input),output=reader.accessorInfo(sampler.output),values=reader.accessor(sampler.output);
   if(input.type!=='SCALAR'||input.componentType!==5126||times.some((t,i)=>t<0||t>120||i>0&&t<=times[i-1]))throw new Error('Animation times must increase within 0–120 seconds.');
   const dimension=path==='rotation'?4:path==='weights'?1:3;
   if(output.componentType!==5126||output.type!==(dimension===1?'SCALAR':`VEC${dimension}`))throw new Error('Invalid animation output type.');
   let weights=1;
   if(path==='weights'){const mesh=gltfRecord(meshes[gltfIndex(nodes[nodeId].mesh,meshes,'morph mesh')],'mesh');const primitive=gltfRecord(gltfArray(mesh.primitives,'primitives')[0],'primitive');weights=gltfArray(primitive.targets,'morph targets').length;if(!weights)throw new Error('Weight animation needs morph targets.');}
   if(values.length!==times.length*dimension*weights*(interpolation==='CUBICSPLINE'?3:1))throw new Error('Animation keyframe counts do not match.');
   duration=Math.max(duration,times[times.length-1]);
  }
  if(animation.name!==undefined&&(typeof animation.name!=='string'||animation.name.length>100))throw new Error('Animation names must contain at most 100 characters.');
  return {name:typeof animation.name==='string'&&animation.name?animation.name:`animation_${index}`,duration,channels:channels.length};
 });
 return {bytes:bytes.length,texturePixels,vertices,triangles,draws,nodes:reachable.size,materials:materials.length,images,skins:skins.length,morphTargets,animations};
}
