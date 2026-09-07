import {describe,expect,it} from 'vitest';
import {parsePreviewView,previewViewDirection} from './previewView';

describe('preview view parsing',()=>{
  it('defaults omitted views to the compatible isometric camera',()=>{
    expect(parsePreviewView(undefined)).toBe('isometric');
    expect(parsePreviewView(null)).toBe('isometric');
  });

  it('accepts only the four supported inspection views',()=>{
    for(const view of ['isometric','front','side','top'])expect(parsePreviewView(view)).toBe(view);
    for(const view of ['', 'rear', ['front'], 1])expect(()=>parsePreviewView(view)).toThrow('isometric, front, side, or top');
  });

  it('maps each view to its orthographic surface-to-camera direction',()=>{
    expect(previewViewDirection('front')).toEqual([0,0,1]);
    expect(previewViewDirection('side')).toEqual([1,0,0]);
    expect(previewViewDirection('top')).toEqual([0,1,0]);
    expect(previewViewDirection('isometric')).toEqual([
      1/Math.sqrt(3),
      1/Math.sqrt(3),
      1/Math.sqrt(3),
    ]);
  });
});
