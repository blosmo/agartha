import {describe,expect,it} from 'vitest';
import {canonicalPreviewFocus,previewObjectsForView,selectPreviewFocus} from './previewFocus';

describe('preview focus parsing',()=>{
  it('keeps one ID compatible and canonicalizes a deduplicated selection',()=>{
    expect(canonicalPreviewFocus('body')).toBe('body');
    expect(canonicalPreviewFocus('lid,body,lid,handle')).toBe('body,handle,lid');
    expect(canonicalPreviewFocus(undefined)).toBeUndefined();
  });

  it('rejects malformed or oversized selections',()=>{
    expect(()=>canonicalPreviewFocus('')).toThrow('1–20 comma-separated');
    expect(()=>canonicalPreviewFocus('body,,lid')).toThrow('1–20 comma-separated');
    expect(()=>canonicalPreviewFocus(Array.from({length:21},(_,i)=>`part-${i}`).join(','))).toThrow('1–20 comma-separated');
    expect(()=>canonicalPreviewFocus(['body'])).toThrow('1–20 comma-separated');
    expect(()=>canonicalPreviewFocus('x'.repeat(4097))).toThrow('1–20 comma-separated');
    expect(()=>canonicalPreviewFocus('x'.repeat(161))).toThrow('1–20 comma-separated');
    expect(canonicalPreviewFocus('x'.repeat(160))).toBe('x'.repeat(160));
  });

  it('selects every canonical ID and rejects an absent object',()=>{
    const objects=[{id:'lid'},{id:'body'},{id:'handle'}];
    expect(selectPreviewFocus(objects,'lid,body,lid')).toEqual([{id:'body'},{id:'lid'}]);
    expect(()=>selectPreviewFocus(objects,'body,missing')).toThrow('not found');
  });

  it('isolates focused orthographic objects while retaining isometric context',()=>{
    const objects=[{id:'body'},{id:'handle'},{id:'bench-leg'}];
    expect(previewObjectsForView(objects,'handle,body','side').objects).toEqual([{id:'body'},{id:'handle'}]);
    expect(previewObjectsForView(objects,'handle,body','isometric').objects).toBe(objects);
    expect(previewObjectsForView(objects,undefined,'side').objects).toBe(objects);
  });
});
