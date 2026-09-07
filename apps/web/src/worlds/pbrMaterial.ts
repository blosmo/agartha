import * as THREE from 'three';
import {materialDefinition} from '../../../../packages/protocol/src/materials';

/** Shared map ownership follows the viewport, not individual instanced materials. */
export class PbrTextures {
  private textures=new Map<string,THREE.Texture>();
  private loader=new THREE.TextureLoader();
  constructor(private onError:()=>void){}
  private load(path:string,srgb=false){
    const cached=this.textures.get(path);if(cached)return cached;
    const texture=this.loader.load(path,undefined,undefined,this.onError);
    texture.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=4;
    this.textures.set(path,texture);return texture;
  }
  apply(material:THREE.MeshStandardMaterial,id?:string){
    const definition=materialDefinition(id);if(!definition)return;
    material.color.set(definition.color);material.roughness=definition.roughness;material.metalness=definition.metalness;
    if(definition.maps){
      material.map=this.load(definition.maps.albedo,true);
      material.normalMap=this.load(definition.maps.normal);material.normalScale.set(.65,.65);
      const arm=this.load(definition.maps.arm);material.aoMap=arm;material.roughnessMap=arm;material.metalnessMap=arm;
      material.aoMapIntensity=.65;
    }
  }
  dispose(){for(const texture of this.textures.values())texture.dispose();this.textures.clear();}
}
