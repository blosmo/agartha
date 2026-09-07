import * as THREE from 'three';
import { compileSurface } from '../../../../packages/protocol/src/surfaceShaders';
import type { SharedShader } from '../../../../packages/protocol/src/sharedLibrary';
export function surfaceMaterial(definition:SharedShader|undefined,time:{value:number}) {
  const material=new THREE.MeshStandardMaterial({roughness:.85,flatShading:true});
  if(!definition)return material;
  const program=compileSurface(definition.expression);
  material.customProgramCacheKey=()=>`${definition.id}:${program.glsl}`;
  material.onBeforeCompile=shader=>{
    shader.uniforms.agarthaTime=time;
    shader.vertexShader='varying vec3 vAgarthaPosition;\nvarying vec3 vAgarthaNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAgarthaPosition = position;\nvAgarthaNormal = normal;');
    shader.fragmentShader=`varying vec3 vAgarthaPosition;\nvarying vec3 vAgarthaNormal;\nuniform float agarthaTime;\n${program.glsl}\n`+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb = agarthaShade(vAgarthaPosition, vAgarthaNormal, diffuseColor.rgb, agarthaTime);');
  };
  return material;
}
