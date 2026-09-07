import {expect,it} from 'vitest';
import {plotPreviewSnapshot} from '../apps/web/plotPreview';
import {createWorld} from '../apps/web/src/worlds/world';
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
