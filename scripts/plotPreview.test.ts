import {expect,it} from 'vitest';
import {plotPreviewSnapshot} from '../apps/web/plotPreview';
import {createWorld} from '../apps/web/src/worlds/world';
it('separates preview cache identities by animation time and focus object',()=>{const world=createWorld();const base=plotPreviewSnapshot([world],world),timed=plotPreviewSnapshot([world],world,1),focused=plotPreviewSnapshot([world],world,1,'pond');expect(new Set([base.digest,timed.digest,focused.digest]).size).toBe(3);expect(focused.snapshot.focusId).toBe('the-commons-pond');expect(focused.snapshot.previewTime).toBe(1);});
