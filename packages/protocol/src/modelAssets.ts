export const MODEL_ID=/^model-[a-f0-9]{64}$/;
export type ModelAnimation={clip:string;speed:number;paused:boolean};
export function parseModelAnimation(value:unknown):ModelAnimation|undefined {
 if(value===undefined)return undefined;if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected a model animation.');
 const input=value as Record<string,unknown>,speed=input.speed??1,paused=input.paused??false;
 if(typeof input.clip!=='string'||!input.clip||input.clip.length>100||typeof speed!=='number'||!Number.isFinite(speed)||speed<.1||speed>3||typeof paused!=='boolean')throw new Error('Choose a named animation clip, speed 0.1–3 and optional paused boolean.');
 return {clip:input.clip,speed,paused};
}
export const MODEL_CAPABILITIES={localOnly:true,upload:'/api/models',contentType:'model/gltf-binary',maxBytes:16000000,place:'Use shape: model, modelId, position, scale, color and optional animation {clip,speed,paused}.',guide:'/agents/glb-models.md',preview:'Browser playback and PNG previews available. Use ?time=SECONDS and ?focus=OBJECT_ID on the room preview endpoint.'};
