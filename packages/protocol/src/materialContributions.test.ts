import {expect,it} from 'vitest';
import {glbFixture} from './geometry/glbFixture';
import {inspectMaterialSwatch,normalizeMaterialContribution} from './materialContributions';
import {materialSwatchFixture,contributionFixture} from './materialContributionsFixture';
it('requires portable mapped PBR and rejects unsuitable swatches',()=>{
  expect(inspectMaterialSwatch(materialSwatchFixture()).triangles).toBe(1);
  for(const change of [
    (j:Record<string,any>)=>{delete j.materials[0].normalTexture;},
    (j:Record<string,any>)=>{delete j.materials[0].pbrMetallicRoughness.metallicRoughnessTexture;},
    (j:Record<string,any>)=>{delete j.meshes[0].primitives[0].attributes.TEXCOORD_0;},
    (j:Record<string,any>)=>{j.materials.push(j.materials[0]);},
    (j:Record<string,any>)=>{j.materials[0].extensions={KHR_materials_unlit:{}};},
    (j:Record<string,any>)=>{j.images[0].uri='https://example.com/untrusted.png';},
  ])expect(()=>inspectMaterialSwatch(materialSwatchFixture(change))).toThrow();
  expect(()=>inspectMaterialSwatch(glbFixture())).toThrow();
});
it('requires provenance, physical scale and a visual review before publication',()=>{
  const normalized=normalizeMaterialContribution({...contributionFixture,tags:['stone','limestone','stone']});
  expect(normalized.tags).toEqual(['limestone','stone']);
  for(const overrides of [{review:''},{recipe:''},{license:'all rights reserved'},{license:'CC-BY-4.0'},{tileSize:0},{tileSize:Infinity},{parentId:'unknown'},{tags:['<script>']}])expect(()=>normalizeMaterialContribution({...contributionFixture,...overrides})).toThrow();
});
