import {glbFixture} from './geometry/glbFixture';
export function materialSwatchFixture(change:(json:Record<string,any>)=>void=()=>{}){
  return glbFixture(json=>{
    delete json.animations;
    json.accessors.push({bufferView:0,componentType:5126,type:'VEC2',count:3});
    json.meshes[0].primitives[0].attributes.TEXCOORD_0=4;
    json.images=[{uri:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNocFD4DwAEBAHgAJsDCwAAAABJRU5ErkJggg=='}];
    json.textures=[{source:0}];
    json.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};
    json.materials[0].pbrMetallicRoughness.metallicRoughnessTexture={index:0};
    json.materials[0].normalTexture={index:0};
    change(json);
  });
}
export const contributionFixture={bundleId:`bundle-${'a'.repeat(64)}`,name:'Cut limestone',description:'Fine masonry with shallow joints.',tags:['stone','limestone'],license:'CC0-1.0',attribution:'',recipe:'Native Brick and Noise nodes, shallow bump, UV tile.',tileSize:2,review:'Reviewed the repeated tile and a model close-up; joints retain their scale.'};
