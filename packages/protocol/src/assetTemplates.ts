/** Declarative, portable geometry templates. No script text or arbitrary execution. */
export const ASSET_TEMPLATE_ID=/^template-[a-f0-9]{64}$/;
export const TEMPLATE_LIMITS={bytes:32000,parameters:24,parts:128,expandedParts:256,depth:8,repeat:32} as const;
export type TemplateValue=number|string|boolean;
export type AssetTemplateDefinition={version:1;name:string;description:string;parameters:Record<string,Record<string,unknown>>;materials:Record<string,Record<string,unknown>>;parts:Record<string,unknown>[]};
const namePattern=/^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const operators=new Set(['add','sub','mul','div','sin','cos','eq','lt','and','or','not','min','max']);
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected a template object.');return value as Record<string,unknown>;}
function fields(raw:Record<string,unknown>,allowed:string[]){if(Object.keys(raw).some(key=>!allowed.includes(key)))throw new Error('Unknown template field.');}
function text(value:unknown,max:number){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Invalid template text.');return value.trim();}
function identifier(value:string){if(!namePattern.test(value)||['constructor','prototype','__proto__'].includes(value))throw new Error('Invalid template key.');}
function stable(value:unknown):unknown{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)]));return value;}
export function templateIdentity(value:unknown){return JSON.stringify(stable(value));}

export function normalizeTemplateParameters(definition:AssetTemplateDefinition,input:unknown={}):Record<string,TemplateValue>{
 const values=record(input);if(Object.keys(values).some(key=>!Object.hasOwn(definition.parameters,key)))throw new Error('Unknown template parameter.');
 const result:Record<string,TemplateValue>={};
 for(const [key,spec] of Object.entries(definition.parameters)){
  const value=Object.hasOwn(values,key)?values[key]:spec.default;
  if(spec.type==='number'||spec.type==='integer'){
   if(typeof value!=='number'||!Number.isFinite(value)||spec.type==='integer'&&!Number.isSafeInteger(value)||value<(spec.min as number)||value>(spec.max as number))throw new Error(`Parameter ${key} is outside its bounds.`);
  }else if(spec.type==='boolean'){if(typeof value!=='boolean')throw new Error(`Parameter ${key} must be boolean.`);}
  else if(spec.type==='color'){if(typeof value!=='string'||!/^#[a-fA-F0-9]{6}$/.test(value))throw new Error(`Parameter ${key} must be a hex color.`);}
  else if(spec.type==='enum'){if(!Array.isArray(spec.values)||!spec.values.includes(value))throw new Error(`Parameter ${key} must be one of its choices.`);}
  else throw new Error('Unsupported template parameter type.');
  result[key]=value as TemplateValue;
 }
 return result;
}

export function normalizeAssetTemplate(input:unknown):AssetTemplateDefinition{
 const raw=record(input);fields(raw,['version','name','description','parameters','materials','parts']);
 if(raw.version!==1||new TextEncoder().encode(JSON.stringify(raw)).length>TEMPLATE_LIMITS.bytes)throw new Error('Unsupported or oversized template.');
 const name=text(raw.name,80),description=text(raw.description,500),parameters=record(raw.parameters),materials=record(raw.materials);
 if(Object.keys(parameters).length>TEMPLATE_LIMITS.parameters||!Object.keys(materials).length||Object.keys(materials).length>16)throw new Error('Template parameter or material limit exceeded.');
 for(const [key,value] of Object.entries(parameters)){
  identifier(key);const spec=record(value);fields(spec,['type','default','min','max','values']);
  if(['number','integer'].includes(String(spec.type))){
   if(typeof spec.min!=='number'||typeof spec.max!=='number'||!Number.isFinite(spec.min)||!Number.isFinite(spec.max)||Math.abs(spec.min)>10000||Math.abs(spec.max)>10000||spec.min>spec.max)throw new Error('Declare finite template parameter bounds.');
  }else if(spec.type==='enum'){
   if(!Array.isArray(spec.values)||!spec.values.length||spec.values.length>24||spec.values.some(v=>typeof v!=='string'||!v||v.length>80))throw new Error('Declare bounded template choices.');
  }else if(!['boolean','color'].includes(String(spec.type)))throw new Error('Unsupported parameter type.');
 }
 let nodes=0;
 function expression(value:unknown,vars:Set<string>,depth=0):void{
  if(++nodes>2048||depth>TEMPLATE_LIMITS.depth)throw new Error('Template expression budget exceeded.');
  if(typeof value==='number'){if(!Number.isFinite(value)||Math.abs(value)>10000)throw new Error('Invalid expression number.');return;}
  if(typeof value==='boolean'||typeof value==='string'&&value.length<=80)return;
  const node=record(value);
  if('param' in node){fields(node,['param']);if(typeof node.param!=='string'||!Object.hasOwn(parameters,node.param))throw new Error('Unknown parameter reference.');return;}
  if('var' in node){fields(node,['var']);if(typeof node.var!=='string'||!vars.has(node.var))throw new Error('Unknown repeat variable.');return;}
  if('op' in node){fields(node,['op','args']);if(!operators.has(String(node.op))||!Array.isArray(node.args)||node.args.length<1||node.args.length>8)throw new Error('Invalid expression operation.');const arity=['sin','cos','not'].includes(String(node.op))?1:['eq','lt'].includes(String(node.op))?2:null;if(arity!==null&&node.args.length!==arity)throw new Error('Invalid expression arity.');node.args.forEach(arg=>expression(arg,vars,depth+1));return;}
  fields(node,['choose','cases','default']);expression(node.choose,vars,depth+1);const cases=record(node.cases);if(Object.keys(cases).length>24)throw new Error('Too many expression choices.');Object.values(cases).forEach(item=>expression(item,vars,depth+1));expression(node.default,vars,depth+1);
 }
 for(const [key,value] of Object.entries(materials)){
  identifier(key);const mat=record(value);fields(mat,['color','roughness','metallic','texture']);
  expression(mat.color,new Set());for(const field of ['roughness','metallic'])if(mat[field]!==undefined)expression(mat[field],new Set());
  if(mat.texture!==undefined){const texture=record(mat.texture);fields(texture,['kind','scale']);expression(texture.kind,new Set());if(texture.scale!==undefined)expression(texture.scale,new Set());}
 }
 let count=0;
 function parts(items:unknown,vars=new Set<string>(),depth=0):void{
  if(!Array.isArray(items)||!items.length||depth>TEMPLATE_LIMITS.depth)throw new Error('Invalid template parts.');
  for(const value of items){
   if(++count>TEMPLATE_LIMITS.parts)throw new Error('Template part limit exceeded.');const part=record(value);
   if(part.when!==undefined)expression(part.when,vars);
   if(part.kind==='repeat'){
    fields(part,['kind','count','var','parts','when']);if(typeof part.var!=='string')throw new Error('Repeat needs a variable.');identifier(part.var);if(vars.has(part.var))throw new Error('Repeat variables must not shadow.');expression(part.count,vars);parts(part.parts,new Set([...vars,part.var]),depth+1);continue;
   }
   const dimensions:Record<string,string[]>={box:['size'],cylinder:['radius','depth'],sphere:['radius','scale'],beam:['start','end','width']};
   const shape=dimensions[String(part.kind)];if(!shape)throw new Error('Unsupported template geometry.');
   fields(part,['kind','name','position','rotation','material','bevel','when',...shape]);text(part.name,80);
   if(typeof part.material!=='string'||!Object.hasOwn(materials,part.material))throw new Error('Unknown template material.');
   for(const field of ['position','rotation',...shape]){
    if(part[field]===undefined){if(['rotation','scale'].includes(field)||part.kind==='beam'&&field==='position')continue;throw new Error(`Missing part ${field}.`);}
    if(['position','rotation','size','scale','start','end'].includes(field)){
     if(!Array.isArray(part[field])||(part[field] as unknown[]).length!==3)throw new Error('Template vectors need three values.');(part[field] as unknown[]).forEach(item=>expression(item,vars));
    }else expression(part[field],vars);
   }
   if(part.bevel!==undefined)expression(part.bevel,vars);
  }
 }
 parts(raw.parts);
 const definition={version:1 as const,name,description,parameters:parameters as AssetTemplateDefinition['parameters'],materials:materials as AssetTemplateDefinition['materials'],parts:raw.parts as Record<string,unknown>[]};
 normalizeTemplateParameters(definition);
 return JSON.parse(templateIdentity(definition)) as AssetTemplateDefinition;
}
