import { anyApi, httpActionGeneric, type HttpRouter } from 'convex/server';
import { ConvexError } from 'convex/values';

const functions=anyApi.scene.authority;
const library=anyApi.scene.library;
async function body(request: Request): Promise<Record<string,unknown>> {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new ConvexError({code:'invalid',message:'Use application/json.'});
  const reader=request.body?.getReader();
  if(!reader) throw new ConvexError({code:'invalid',message:'JSON body required.'});
  let size=0; const chunks:Uint8Array[]=[];
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw new ConvexError({code:'too_large',message:'Request exceeds 64 KB.'});chunks.push(value);}
  } finally {await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try {const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}
  catch {throw new ConvexError({code:'invalid',message:'Expected a JSON object.'});}
}
function reply(request:Request,data:unknown,status=200) {
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(request.headers.get('origin')===process.env.AGARTHA_SCENE_VIEWER_ORIGIN){headers['Access-Control-Allow-Origin']=request.headers.get('origin')!;headers['Access-Control-Allow-Headers']='Content-Type, Authorization';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
  if(status===429)headers['Retry-After']='60';
  return new Response(JSON.stringify(data),{status,headers});
}
export function registerSceneRoutes(router:HttpRouter) {
  const handler=httpActionGeneric(async(ctx,request)=>{
    try {
      const origin=request.headers.get('origin');
      if(origin&&origin!==process.env.AGARTHA_SCENE_VIEWER_ORIGIN) return reply(request,{error:'Origin not allowed'},403);
      if(request.method==='OPTIONS')return reply(request,{});
      const url=new URL(request.url);
      const token=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
      const match=url.pathname.match(/^\/v2\/worlds\/([a-zA-Z0-9_-]{1,80})(?:\/(objects|inspect|activity|join|invite|edit|brief|revoke|grid|traverse|tools|library)(?:\/([a-zA-Z0-9_-]+))?)?$/);
      if(!match)return reply(request,{error:'Unknown scene route'},404);
      const worldId=match[1],route=match[2]??'metadata',entryId=match[3];
      if(entryId&&route!=='library')return reply(request,{error:'Unknown route'},404);
      if(request.method==='GET'){
        if(route==='library')return reply(request,entryId?await ctx.runQuery(library.get,{worldId,token,id:entryId}):await ctx.runQuery(library.list,{worldId,token,kind:url.searchParams.get('kind')??'asset',paginationOpts:{numItems:Number(url.searchParams.get('limit')??20),cursor:url.searchParams.get('cursor')}}));
        if(route==='grid')return reply(request,await ctx.runQuery(functions.grid,{worldId,token}));
        if(route==='tools')return reply(request,await ctx.runQuery(functions.tools,{}));
        if(route==='metadata')return reply(request,await ctx.runQuery(functions.metadata,{worldId,token}));
        if(route==='objects')return reply(request,await ctx.runQuery(functions.objects,{worldId,token,region:url.searchParams.get('region')??'0:0',paginationOpts:{numItems:Number(url.searchParams.get('limit')??100),cursor:url.searchParams.get('cursor')}}));
        if(route==='inspect')return reply(request,await ctx.runQuery(functions.inspect,{worldId,token,ids:(url.searchParams.get('ids')??'').split(',').filter(Boolean)}));
        if(route==='activity')return reply(request,await ctx.runQuery(functions.activity,{worldId,token,region:url.searchParams.get('region')??'0:0'}));
      } else if(request.method==='POST'){
        const payload=await body(request);
        if(route==='library')return reply(request,entryId?await ctx.runMutation(library.place,{...payload,worldId,token,assetId:entryId}):await ctx.runMutation(library.publish,{...payload,worldId,token}));
        if(route==='traverse')return reply(request,await ctx.runQuery(functions.traverse,{worldId,token,direction:payload.direction}));
        if(route==='tools')return reply(request,await ctx.runMutation(functions.build,{...payload,worldId,token}));
        if(route==='join')return reply(request,await ctx.runMutation(functions.join,{...payload,worldId}));
        if(route==='edit'&&payload.environment!==undefined&&(payload.name!==undefined||payload.archived!==undefined||payload.lifecycleVersion!==undefined))return reply(request,{error:'Update the environment separately from lifecycle'},400);
        const mutation=route==='invite'?functions.invite:route==='edit'?functions.edit:route==='brief'?functions.updateBrief:route==='revoke'?functions.revoke:undefined;
        if(mutation)return reply(request,await ctx.runMutation(mutation,{...payload,worldId,token}));
      }
      return reply(request,{error:'Method not supported for this route'},405);
    } catch(error){
      const data=error instanceof ConvexError?error.data:undefined;
      if(data&&typeof data==='object'&&!Array.isArray(data)&&'code' in data){
        const code=String(data.code);
        const status:Record<string,number>={unauthorized:401,forbidden:403,not_found:404,conflict:409,invalid:400,expired:400,too_large:413,rate_limited:429,quota:429};
        return reply(request,data,status[code]??400);
      }
      if(error instanceof Error&&error.message.includes('ArgumentValidationError'))return reply(request,{error:'Invalid request arguments'},400);
      return reply(request,{error:'Scene service unavailable'},500);
    }
  });
  for(const method of ['GET','POST','OPTIONS'] as const)router.route({pathPrefix:'/v2/worlds/',method,handler});
}
