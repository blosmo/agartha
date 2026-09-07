import type {GlbInspection} from '../../../../packages/protocol/src/geometry/inspectGlb';

// Main-pass work and shared source/texture budgets for the entire visible model layer.
// Texture pixels include distinct sampler bindings; mipmaps and driver allocations are additional.
export const MODEL_VIEW_LIMITS={bytes:32_000_000,texturePixels:16_777_216,triangles:200_000,draws:192,animatedTriangles:100_000};
export function fitsModelResources(existing:Iterable<GlbInspection>,candidate:GlbInspection){
 let bytes=candidate.bytes,pixels=candidate.texturePixels;
 for(const cost of existing){bytes+=cost.bytes;pixels+=cost.texturePixels;}
 return bytes<=MODEL_VIEW_LIMITS.bytes&&pixels<=MODEL_VIEW_LIMITS.texturePixels;
}
export function modelWork(cost:GlbInspection,animated:boolean){return {triangles:cost.triangles,draws:cost.draws,animatedTriangles:animated?cost.triangles:0};}
export function fitsModelWork(total:ReturnType<typeof modelWork>,next:ReturnType<typeof modelWork>){return (Object.keys(total) as Array<keyof typeof total>).every(key=>total[key]+next[key]<=MODEL_VIEW_LIMITS[key]);}
