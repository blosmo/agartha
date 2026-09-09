import { validatePresence, validateRecipient } from '../../packages/protocol/src/agentPresence';
import { chatCursor, CHAT_CAPABILITIES } from '../../packages/protocol/src/chat';
import { governanceRoute } from '../governance/routes';
import { assetRoute, assetCapabilities } from './assetRoutes';
import {MODEL_CAPABILITIES} from '../../packages/protocol/src/modelAssets';
import { proposalRoute } from './proposalRoutes';
import { validatedMotion, validatedAnimation, digest } from '../scene/model';
import {anyApi,httpActionGeneric,type HttpRouter} from 'convex/server';
import {ConvexError} from 'convex/values';
import {BUILDER_CATALOG} from '../../packages/protocol/src/worldbuilding';
import {addressFromId,neighborAddress,SPATIAL_FRAME,worldToLocal} from '../../packages/protocol/src/plots';
import {worldId} from './common';
const read=anyApi.cloud.read,auth=anyApi.cloud.session,write=anyApi.cloud.write,scene=anyApi.scene.authority,library=anyApi.scene.library;
function json(body:unknown,status=200,retryAfter?:number){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(retryAfter===undefined?{}:{'Retry-After':String(retryAfter)})}});}
export function registerCloudRoutes(router:HttpRouter){
  const handler=httpActionGeneric(async(ctx,request)=>{
    const expected=process.env.AGARTHA_CLOUD_GATEWAY_KEY;
    if(!expected||request.headers.get('x-agartha-gateway-key')!==expected)return json({error:'Unauthorized gateway'},401);
    try {
      const url=new URL(request.url),parts=url.pathname.slice('/cloud/'.length).split('/').filter(Boolean),token=request.headers.get('authorization')?.replace(/^Bearer /,'');
      let body:Record<string,any>={};
      if(request.method==='POST'){const raw=await request.text();if(raw.length>(parts[0]==='library'?4_000_000:65536))return json({error:'Request too large'},413);try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}catch{return json({error:'Invalid JSON'},400);}}
      if(parts[0]==='session'&&parts.length===1&&request.method==='POST')return json(await ctx.runMutation(auth.register,{token:body.agentToken,name:body.name,...(body.recoveryToken?{recoveryToken:body.recoveryToken}:{}),ipHash:request.headers.get('x-agartha-client')??'unknown'}));
      if(parts[0]==='session'&&parts.length===2&&request.method==='POST'&&['renew','rotate'].includes(parts[1]))return json(await ctx.runMutation(auth.maintain,{operation:parts[1],token,agentId:body.agentId,recoveryToken:body.recoveryToken,newToken:body.newToken,newRecoveryToken:body.newRecoveryToken}));
      if(parts[0]==='chat' && parts[1]==='presence' && parts.length===2){
        if(request.method==='GET')return json(await ctx.runQuery(anyApi.cloud.presence.feed,{now:Date.now()}));
        if(!token)return json({error:'Register before entering a room.'},401);
        let presence;try{presence=validatePresence(body);}catch(error){return json({error:(error as Error).message},400);}
        return json(await ctx.runMutation(anyApi.cloud.presence.update,{token,...presence}));
      }
      if(parts[0]==='chat' && parts.length===1){
        if(request.method==='GET'){
          let cursor;try{cursor=chatCursor(url);}catch(error){return json({error:(error as Error).message},400);}
          return json(await ctx.runQuery(anyApi.cloud.chat.feed,cursor));
        }
        if(!token)return json({error:'Register an agent before sending a message.'},401);
        try{validateRecipient(body.recipientId);}catch(error){return json({error:(error as Error).message},400);}
        return json(await ctx.runMutation(anyApi.cloud.chat.send,{token,requestId:body.requestId,text:body.text,...(body.recipientId!==undefined?{recipientId:body.recipientId}:{})}));
      }
      const canonicalAsset = await assetRoute(ctx, request, parts, url, token, body);
      if (canonicalAsset !== undefined) return json(canonicalAsset);
      if(parts[0]==='models'){
        if(request.method==='POST'&&parts.length===2&&parts[1]==='upload-ticket'){
          if(!token)return json({error:'Register before importing models.'},401);
          const uploadToken=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
          const result=await ctx.runMutation(anyApi.cloud.models.begin,{token,ticketHash:await digest(uploadToken),metadata:{name:body.name,description:body.description,source:body.source,license:body.license,attribution:body.attribution}});
          return json({...result,uploadToken,uploadUrl:new URL('/model-upload',request.url).href});
        }
        if(request.method==='GET'&&parts.length===1)return json(await ctx.runQuery(anyApi.cloud.models.list,{cursor:url.searchParams.get('cursor')??undefined}));
        if(request.method==='GET'&&parts.length===2)return json(await ctx.runQuery(anyApi.cloud.models.get,{id:parts[1]}));
        if(request.method==='GET'&&parts.length===3&&parts[2]==='file')return json(await ctx.runQuery(anyApi.cloud.models.file,{id:parts[1]}));
        return json({error:'Unknown model operation.'},404);
      }
      if(parts[0]==='spatial'&&parts.length===1&&request.method==='GET'){
        if(!url.searchParams.has('x'))return json(SPATIAL_FRAME);
        try{return json({...worldToLocal(['x','y','z'].map(key=>Number(url.searchParams.get(key)??0))),spatialFrame:SPATIAL_FRAME});}catch{return json({error:'Invalid world coordinates'},400);}
      }
      if(parts[0]==='plots'&&parts.length===1){
        if(request.method==='GET'){const coordinates={x:Number(url.searchParams.get('x')??0),z:Number(url.searchParams.get('z')??0)};return json(url.searchParams.get('view')==='summary'?await ctx.runQuery(read.summary,coordinates):await ctx.runQuery(read.neighborhood,{...coordinates,radius:Number(url.searchParams.get('radius')??1),token}));}
        if(!token)return json({error:'Register an agent first'},401);
        const result=await ctx.runMutation(write.createPlot,{token,x:Number(body.x),z:Number(body.z),name:body.name});return json(await ctx.runQuery(read.plot,{id:result.id,token}));
      }
      if(parts[0]==='library'&&parts.length<=2){
        // The public library is rooted in the public Commons, not in an arbitrary private grid.
        const baseWorld=worldId('the-commons');
        if(request.method==='GET'){
          if(parts[1])return json(await ctx.runQuery(library.get,{worldId:baseWorld,id:parts[1]}));
          const page=await ctx.runQuery(library.list,{worldId:baseWorld,kind:url.searchParams.get('kind')??'asset',paginationOpts:{numItems:20,cursor:url.searchParams.get('cursor')}});return json({entries:page.page,cursor:page.isDone?null:page.continueCursor});
        }
        if(parts.length!==1)return json({error:'Library versions are immutable'},405);
        if(!token)return json({error:'Register an agent first'},401);
        const member=await ctx.runMutation(auth.member,{id:body.plotId,token});return json(await ctx.runMutation(library.publish,{worldId:member.worldId,token:member.token,definition:body.definition}));
      }
      const governance=await governanceRoute(ctx,request,parts,url,token,body);
      if(governance!==undefined)return json(governance);
      const collaboration=await proposalRoute(ctx,request,parts,url,token,body);
      if(collaboration!==undefined)return json(collaboration);
      if(parts[0]!=='plots'||parts.length<2||parts.length>3)return json({error:'Not found'},404);
      const id=parts[1],action=parts[2];addressFromId(id);
      if(request.method==='GET'){
        if(!action)return json(await ctx.runQuery(read.plot,{id,token}));
        if(action==='neighbors')return json(await ctx.runQuery(read.neighbors,{id}));
        if(action==='tools')return json({...BUILDER_CATALOG,chat:CHAT_CAPABILITIES,assets:assetCapabilities(url.origin),governance:await ctx.runQuery(anyApi.governance.queries.discover,{scope:`world:${id}`,token}),models:{...MODEL_CAPABILITIES,localOnly:false,upload:undefined,uploadTicket:'/api/models/upload-ticket',uploadAuthorization:'Use the returned uploadToken as Bearer authorization at uploadUrl; never send the agent session token to that URL.'}});
        if(action==='objects')return json(await ctx.runQuery(scene.objects,{worldId:worldId(id),region:'0:0',paginationOpts:{numItems:100,cursor:url.searchParams.get('cursor')}}));
        if(action==='inspect')return json(await ctx.runQuery(scene.inspect,{worldId:worldId(id),ids:(url.searchParams.get('ids')??'').split(',').filter(Boolean)}));
        if(action==='preview'){
          if(!token)return json({error:'Register before requesting a preview'},401);
          await ctx.runMutation(auth.previewBudget,{token});
          const source=await ctx.runQuery(read.plot,{id,token}),grid=url.searchParams.get('scope')==='grid'?await ctx.runQuery(read.neighborhood,{...addressFromId(id),token}):null;
          return json({render:true,source,grid});
        }
        return json({error:'Not found'},404);
      }
      if(!token)return json({error:'Register an agent first'},401);
      if(action==='traverse'){
        const neighbors=await ctx.runQuery(read.neighbors,{id});const next=neighbors.find((n:{direction:string;exists:boolean})=>n.direction===body.direction);
        if(!next)return json({error:'Choose a cardinal gateway'},400);if(!next.exists)return json({error:'This plot has not been started yet'},404);
        return json({gateway:{from:id,to:next.id,direction:body.direction,permeable:true},world:await ctx.runQuery(read.plot,{id:next.id,token}),permissions:'You may create your own objects; existing objects retain their ownership.'});
      }
      if(action==='lifecycle')return json(await ctx.runMutation(write.lifecycle,{id,token,expectedVersion:body.expectedVersion,name:body.name,archived:body.archived}));
      const member=await ctx.runMutation(auth.member,{id,token});
      const requestId=body.requestId,issuedAt=body.issuedAt;
      if(action==='tools'){
        const result=await ctx.runMutation(scene.build,{worldId:member.worldId,token:member.token,requestId,issuedAt,parameters:body.parameters,preview:body.preview===true});
        if(body.preview===true)return json({...result,concurrency:'object-versions',snapshotVersion:(await ctx.runQuery(read.plot,{id,token})).version});
      }else if(action==='assets'){
        if(typeof body.preview!=='boolean')return json({error:'Choose preview true or false'},400);
        const result=await ctx.runMutation(library.place,{worldId:member.worldId,token:member.token,requestId,issuedAt,assetId:body.assetId,parameters:body.parameters??{},preview:body.preview});
        if(body.preview)return json({...result,concurrency:'object-versions',snapshotVersion:(await ctx.runQuery(read.plot,{id,token})).version});
      }else if(!action){
        if(body.brief!==undefined){
          if(body.objects?.length||body.remove?.length)return json({error:'Update the brief separately from geometry'},400);
          await ctx.runMutation(scene.updateBrief,{worldId:member.worldId,token:member.token,expectedVersion:body.expectedBriefVersion,brief:body.brief});
        }else{
          if(!Array.isArray(body.objects??[])||!Array.isArray(body.remove??[]))return json({error:'Invalid object edit'},400);
          const versions=body.expectedVersions??{};
          const changes=[...(body.objects??[]).map((o:any)=>({id:o.id,expectedVersion:versions[o.id]??0,object:{id:o.id,name:o.name,shape:o.shape,...(o.modelId===undefined?{}:{modelId:o.modelId}),...(o.animation===undefined?{}:{animation:validatedAnimation(o.animation)}),...(o.meshId===undefined?{}:{meshId:o.meshId}),position:o.position,scale:o.scale,color:o.color,...(o.yaw===undefined?{}:{yaw:o.yaw}),...(o.materialId===undefined?{}:{materialId:o.materialId}),...(o.motion===undefined?{}:{motion:validatedMotion(o.motion)}),...(o.shaderId?{shaderId:o.shaderId}:{})}})),...(body.remove??[]).map((id:string)=>({id,expectedVersion:versions[id]??0}))];
          await ctx.runMutation(scene.edit,{worldId:member.worldId,token:member.token,requestId,issuedAt,message:body.message,changes});
        }
      }else return json({error:'Not found'},404);
      return json(await ctx.runQuery(read.plot,{id,token}));
    }catch(error){
      const data=error instanceof ConvexError?error.data:null;
      if(data&&typeof data==='object'&&!Array.isArray(data)&&'code'in data){const status:Record<string,number>={unauthorized:401,forbidden:403,not_found:404,conflict:409,invalid:400,expired:400,quota:429,rate_limited:429};return json({error:'message'in data?String(data.message):String(data.code),code:data.code,...('conflicts'in data?{conflicts:data.conflicts}:{}),...('currentRevision'in data?{currentRevision:data.currentRevision}:{})},status[String(data.code)]??400,'retryAfter'in data?Number(data.retryAfter):undefined);}
      if(error instanceof Error&&/ArgumentValidationError|plot address|plot coordinates/.test(error.message))return json({error:'Invalid request arguments'},400);
      console.error('Cloud request failed',error instanceof Error?error.message:'unknown');return json({error:'Cloud service unavailable'},500);
    }
  });
  router.route({pathPrefix:'/cloud/',method:'GET',handler});router.route({pathPrefix:'/cloud/',method:'POST',handler});
}
