import {expect,it} from 'vitest';
import {plotPreviewSnapshot} from '../apps/web/plotPreview';
import {createWorld} from '../apps/web/src/worlds/world';
import {parseRoomEnvironment} from '../packages/protocol/src/roomEnvironment';
import {parseObjectMotion} from '../packages/protocol/src/objectMotion';
it('separates preview cache identities by animation time, canonical focus selection, and view',()=>{const world=createWorld();const base=plotPreviewSnapshot([world],world),timed=plotPreviewSnapshot([world],world,1),focused=plotPreviewSnapshot([world],world,1,'pond'),assembly=plotPreviewSnapshot([world],world,1,'pond,island,pond'),sameAssembly=plotPreviewSnapshot([world],world,1,'island,pond'),front=plotPreviewSnapshot([world],world,1,'pond','front' as never);expect(new Set([base.digest,timed.digest,focused.digest,assembly.digest,front.digest]).size).toBe(5);expect(assembly.digest).toBe(sameAssembly.digest);expect(focused.snapshot.focusId).toBe('the-commons-pond');expect(assembly.snapshot.focusId).toBe('the-commons-island,the-commons-pond');expect(focused.snapshot.previewTime).toBe(1);expect(base.snapshot.view).toBe('isometric');expect(front.snapshot.view).toBe('front');});

it('removes unrelated geometry only from focused orthographic snapshots',()=>{
 const world=createWorld(),focus='pond,island';
 const side=plotPreviewSnapshot([world],world,0,focus,'side'),isometric=plotPreviewSnapshot([world],world,0,focus,'isometric'),wholeSide=plotPreviewSnapshot([world],world,0,undefined,'side');
 expect(side.snapshot.objects.map(object=>object.id)).toEqual(['the-commons-island','the-commons-pond']);
 expect(isometric.snapshot.objects.map(object=>object.id)).toEqual(['the-commons-island','the-commons-island-rock','the-commons-pond']);
 expect(wholeSide.snapshot.objects).toEqual(isometric.snapshot.objects);
});

it('changes identity when render content changes without a revision change',()=>{
 const world=createWorld(),meshA=`mesh-${'a'.repeat(64)}`,meshB=`mesh-${'b'.repeat(64)}`;
 const first={...world,objects:[{...world.objects[0],shape:'mesh' as const,meshId:meshA}]};
 const changedMesh={...world,objects:[{...first.objects[0],meshId:meshB}]};
 const changedColor={...world,objects:[{...first.objects[0],color:'#112233'}]};
 expect(new Set([plotPreviewSnapshot([first],first).digest,plotPreviewSnapshot([changedMesh],changedMesh).digest,plotPreviewSnapshot([changedColor],changedColor).digest]).size).toBe(3);
});

it('invalidates previews for environment and full path changes without unrelated neighbor overrides',()=>{
 const original=createWorld();
 const warm={...original,environment:parseRoomEnvironment({preset:'golden-hour'})};
 const dim={...warm,environment:parseRoomEnvironment({preset:'golden-hour',exposure:.6})};
 const moving={...warm,objects:[{...warm.objects[0],motion:parseObjectMotion({kind:'path',points:[[0,0,0],[2,0,0]]})}]};
 const redirected={...moving,objects:[{...moving.objects[0],motion:parseObjectMotion({kind:'path',points:[[0,0,0],[0,0,2]]})}]};
 const snapshots=[original,warm,dim,moving,redirected].map(world=>plotPreviewSnapshot([world],world));
 expect(new Set(snapshots.map(value=>value.digest)).size).toBe(5);
 expect(snapshots[1].snapshot.environment).toEqual(warm.environment);
 const neighbor={...original,id:'neighbor',environment:parseRoomEnvironment({preset:'moonlit'})};
 expect(plotPreviewSnapshot([warm,neighbor],warm).snapshot.environment).toEqual(warm.environment);
 expect(plotPreviewSnapshot([{...warm,archived:true}],{...warm,archived:true}).snapshot.environment).toBeUndefined();
});
