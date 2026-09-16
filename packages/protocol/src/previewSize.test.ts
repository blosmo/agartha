import {describe,expect,it} from 'vitest';
import {BUILDER_CATALOG} from './worldbuilding';
import {
  PREVIEW_DEFAULT_HEIGHT,
  PREVIEW_DEFAULT_WIDTH,
  PREVIEW_MAX_HEIGHT,
  PREVIEW_MAX_WIDTH,
  parsePreviewSize,
  previewSizeHeader,
} from './previewSize';

describe('preview size parsing',()=>{
  it('defaults omitted sizes to the 2× 1920×1280 room PNG',()=>{
    expect(parsePreviewSize(undefined,undefined)).toEqual({width:PREVIEW_DEFAULT_WIDTH,height:PREVIEW_DEFAULT_HEIGHT});
    expect(parsePreviewSize(null,'')).toEqual({width:1920,height:1280});
    expect(previewSizeHeader(parsePreviewSize(undefined,undefined))).toBe('1920x1280');
  });

  it('accepts explicit integers and infers the omitted 3:2 dimension',()=>{
    expect(parsePreviewSize(960,640)).toEqual({width:960,height:640});
    expect(parsePreviewSize('2880','1920')).toEqual({width:PREVIEW_MAX_WIDTH,height:PREVIEW_MAX_HEIGHT});
    expect(parsePreviewSize(960,undefined)).toEqual({width:960,height:640});
    expect(parsePreviewSize(undefined,640)).toEqual({width:960,height:640});
  });

  it('rejects non-integers and sizes outside the hosted render cap',()=>{
    for(const value of ['rear',1.5,['1920'],{}])expect(()=>parsePreviewSize(value,640)).toThrow('width must be an integer');
    expect(()=>parsePreviewSize(1920,'tall')).toThrow('height must be an integer');
    expect(()=>parsePreviewSize(63,64)).toThrow('64–2880 × 64–1920');
    expect(()=>parsePreviewSize(2881,1280)).toThrow('64–2880 × 64–1920');
    expect(()=>parsePreviewSize(1920,1921)).toThrow('64–2880 × 64–1920');
  });

  it('publishes the same default and cap on the builder catalog',()=>{
    expect(BUILDER_CATALOG.visualReview.size).toMatchObject({
      width:PREVIEW_DEFAULT_WIDTH,
      height:PREVIEW_DEFAULT_HEIGHT,
      min:{width:64,height:64},
      max:{width:PREVIEW_MAX_WIDTH,height:PREVIEW_MAX_HEIGHT},
    });
  });
});
