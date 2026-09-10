import {describe,it,expect} from 'vitest';
import {normalizeAssetTemplate,normalizeTemplateParameters,templateIdentity} from './assetTemplates';
const fixture=()=>({version:1,name:'Chair',description:'A procedural chair',parameters:{width:{type:'number',min:.4,max:1.2,default:.6},finish:{type:'enum',values:['oak','walnut'],default:'oak'},arms:{type:'boolean',default:false}},materials:{wood:{color:'#8a6545',roughness:.5,metallic:0}},parts:[{kind:'box',name:'Seat',position:[0,0,.45],size:[{param:'width'},.6,.08],material:'wood'}]});
describe('procedural asset templates',()=>{
 it('preserves a bounded typed generator and resolves defaults',()=>{
  const definition=normalizeAssetTemplate(fixture());
  expect(normalizeTemplateParameters(definition,{width:.9})).toEqual({arms:false,finish:'oak',width:.9});
  expect(templateIdentity(definition)).toBe(templateIdentity(normalizeAssetTemplate({...fixture(),parameters:{arms:{type:'boolean',default:false},finish:{type:'enum',values:['oak','walnut'],default:'oak'},width:{type:'number',min:.4,max:1.2,default:.6}}})));
 });
 it('rejects unknown knobs, invalid options, source code and deep expressions',()=>{
  const definition=normalizeAssetTemplate(fixture());
  for(const parameters of [{width:4},{finish:'plastic'},{arms:'yes'},{secret:true}])expect(()=>normalizeTemplateParameters(definition,parameters)).toThrow();
  expect(()=>normalizeAssetTemplate({...fixture(),python:'import os'})).toThrow();
  let expression:unknown=1;for(let i=0;i<10;i++)expression={op:'add',args:[expression,1]};
  expect(()=>normalizeAssetTemplate({...fixture(),parts:[{...fixture().parts[0],size:[expression,.6,.08]}]})).toThrow('budget');
  expect(()=>normalizeAssetTemplate({...fixture(),parts:[{...fixture().parts[0],size:[{param:'missing'},.6,.08]}]})).toThrow();
 });
 it('validates unused choice branches and repeat variables',()=>{
  expect(()=>normalizeAssetTemplate({...fixture(),parts:[{...fixture().parts[0],when:{choose:'a',cases:{a:true,b:{op:'python',args:['exec']}},default:false}}]})).toThrow();
  expect(()=>normalizeAssetTemplate({...fixture(),parts:[{...fixture().parts[0],position:[{var:'i'},0,0]}]})).toThrow();
 });
});
it('accepts a bounded UTF-8 definition whose escaped representation is larger',()=>{
 const values=Array.from({length:8},(_,i)=>'椅'.repeat(26)+i);
 const definition={version:1,name:'Unicode chair',description:'Valid Unicode controls',parameters:Object.fromEntries(Array.from({length:24},(_,i)=>[`choice${i}`,{type:'enum',default:values[0],values}])),materials:{wood:{color:'#806040'}},parts:[{kind:'box',name:'Seat',material:'wood',position:[0,0,0],size:[1,1,1]}]};
 expect(new TextEncoder().encode(JSON.stringify(definition)).length).toBeLessThan(32000);
 expect(normalizeAssetTemplate(definition).name).toBe('Unicode chair');
});
