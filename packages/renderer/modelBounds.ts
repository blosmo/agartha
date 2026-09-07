import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
/** Shared fitting envelope for the interactive model and deterministic agent previews. */
export function modelBounds(gltf:Pick<GLTF,'scene'|'animations'>){
 const bounds=new THREE.Box3(),mixer=new THREE.AnimationMixer(gltf.scene);gltf.scene.updateMatrixWorld(true);bounds.setFromObject(gltf.scene,true);
 for(const clip of gltf.animations){const action=mixer.clipAction(clip);action.play();for(let i=0;i<=16;i++){mixer.setTime(clip.duration*i/16);gltf.scene.updateMatrixWorld(true);bounds.union(new THREE.Box3().setFromObject(gltf.scene,true));}action.stop();}
 mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);gltf.scene.updateMatrixWorld(true);
 if(bounds.isEmpty()||!Number.isFinite(bounds.min.length()+bounds.max.length()))throw new Error('Model has no finite visible bounds.');
 return bounds.expandByVector(bounds.getSize(new THREE.Vector3()).multiplyScalar(.05));
}
