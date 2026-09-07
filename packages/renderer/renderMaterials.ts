/// <reference types="@webgpu/types" />
import type {PbrMaterial} from '../protocol/src/materials';
export type Pixels={width:number;height:number;data:Uint8Array};
export type TexturePlacement={channel:number;matrix:number[];wrapS?:number;wrapT?:number;minFilter?:number;magFilter?:number};
export type RenderMaterial=PbrMaterial & {
 pixels?:{albedo?:Pixels;normal?:Pixels;arm?:Pixels;ao?:Pixels;emissive?:Pixels};
 placements?:{albedo:TexturePlacement;normal:TexturePlacement;arm:TexturePlacement;ao:TexturePlacement;emissive:TexturePlacement};
 flipY?:boolean;opacity?:number;alphaCutoff?:number;transparent?:boolean;doubleSided?:boolean;unlit?:boolean;
 normalScale?:[number,number];aoIntensity?:number;emissive?:[number,number,number];
};
export const IDENTITY_UV=[1,0,0,0,1,0,0,0,1];

export function materialSamplerOptions(texture?:TexturePlacement):GPUSamplerDescriptor {
 const wrap=(value?:number)=>value===1001?'clamp-to-edge' as const:value===1002?'mirror-repeat' as const:'repeat' as const;
 const min=texture?.minFilter??1008;
 return {addressModeU:wrap(texture?.wrapS),addressModeV:wrap(texture?.wrapT),magFilter:texture?.magFilter===1003?'nearest':'linear',minFilter:[1003,1004,1005].includes(min)?'nearest':'linear',mipmapFilter:[1005,1008].includes(min)?'linear':'nearest',lodMaxClamp:[1003,1006].includes(min)?0:32};
}
