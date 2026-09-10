import {anyApi,type GenericActionCtx,type GenericDataModel} from 'convex/server';
import {fail} from '../scene/model';
import {MATERIAL_CONTRIBUTION_CAPABILITIES} from '../../packages/protocol/src/materialContributions';
export async function materialRoute(ctx:GenericActionCtx<GenericDataModel>,request:Request,parts:string[],url:URL,token:string|undefined,body:Record<string,unknown>):Promise<unknown|undefined>{
  if(parts[0]!=='materials'||parts[1]!=='library')return undefined;
  if(request.method==='GET'){
    if(parts.length===3&&parts[2]==='capabilities')return MATERIAL_CONTRIBUTION_CAPABILITIES;
    if(parts.length===3)return ctx.runQuery(anyApi.cloud.materials.get,{id:parts[2]});
    if(parts.length===2)return ctx.runQuery(anyApi.cloud.materials.list,{cursor:url.searchParams.get('cursor')??undefined,q:url.searchParams.get('q')??undefined,tag:url.searchParams.get('tag')??undefined});
  }
  if(request.method==='POST'&&parts.length===2){
    if(!token)fail('unauthorized','Register before contributing a material.');
    return ctx.runAction(anyApi.cloud.materials.publish,{token,definition:body});
  }
  fail('not_found','Unknown material library operation.');
}
