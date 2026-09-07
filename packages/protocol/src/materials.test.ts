import {expect,it} from 'vitest';
import {PBR_MATERIALS,validateMaterialId} from './materials';
import {normalizeLibraryDefinition,instantiateAsset} from './sharedLibrary';
it('rejects unknown material identifiers and arbitrary texture URLs',()=>{expect(()=>validateMaterialId('https://example.com/texture.png')).toThrow();expect(()=>validateMaterialId('pbr-unknown')).toThrow();});
it('preserves PBR selection through shared asset publication and placement',()=>{const asset=normalizeLibraryDefinition({kind:'asset',name:'Bench',objects:[{name:'Seat',shape:'box',position:[0,1,0],scale:[2,1,1],color:'#ffffff',materialId:'pbr-dark-wood'}]});if(asset.kind!=='asset')throw new Error('Expected asset');expect(instantiateAsset(asset,{},'placed')[0].materialId).toBe('pbr-dark-wood');});
it('has distinct material IDs and complete map sets for scanned materials',()=>{expect(new Set(PBR_MATERIALS.map(m=>m.id)).size).toBe(PBR_MATERIALS.length);for(const material of PBR_MATERIALS){expect(validateMaterialId(material.id)).toBe(material.id);if(material.maps)expect(Object.keys(material.maps).sort()).toEqual(['albedo','arm','normal']);}});
