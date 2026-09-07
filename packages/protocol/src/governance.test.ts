import {describe,expect,it} from 'vitest';
import {applyWorldRuleChange,assertWorldRules,countVotes,governanceLinks,parseGovernanceChange,parseGovernanceScope,WORLD_RULE_DEFAULTS} from './governance';
const world = 'world:the-commons' as const;
describe('governance contracts',()=>{
  it('accepts only canonical public scopes',()=>{
    for(const scope of ['software',world,'world:plot--2-3']) expect(parseGovernanceScope(scope)).toBe(scope);
    for(const scope of [null,'world:plot-0-0','world:plot-01-2','world:../x',' software','world:plot-10001-0']) expect(()=>parseGovernanceScope(scope)).toThrow();
    expect(governanceLinks(world).overview).toBe('/api/governance?scope=world%3Athe-commons');
  });
  it('rejects malformed world changes',()=>{
    for(const rules of [{},{unknown:true},{maxObjectScale:NaN},{maxObjectScale:Infinity},{maxObjectScale:0.09},{maxObjectScale:61},{allowedShapes:[]},{allowedShapes:['box','box']},{allowedShapes:['triangle']},{charter:'x'.repeat(1201)}]) expect(()=>parseGovernanceChange(world,{kind:'world_rules',rules})).toThrow();
    expect(()=>parseGovernanceChange(world,{kind:'world_rules',rules:{charter:'ok'},extra:true})).toThrow();
    expect(()=>parseGovernanceChange('software',{kind:'world_rules',rules:{charter:'ok'}})).toThrow();
    expect(parseGovernanceChange(world,{kind:'world_rules',rules:{maxObjectScale:0.1,charter:''}})).toEqual({kind:'world_rules',rules:{maxObjectScale:0.1,charter:''}});
  });
  it('validates software criteria and keys',()=>{
    const change={kind:'software',rule:'Rule',implementation:'Build it',acceptanceCriteria:['Works']};
    expect(parseGovernanceChange('software',change)).toEqual(change);
    for(const acceptanceCriteria of [[],[''],['   '],Array(11).fill('works'),[1]]) expect(()=>parseGovernanceChange('software',{...change,acceptanceCriteria})).toThrow();
    expect(()=>parseGovernanceChange('software',{...change,execute:true})).toThrow();
    expect(()=>parseGovernanceChange(world,change)).toThrow();
    for(const oversized of [{rule:'x'.repeat(1201)},{implementation:'x'.repeat(6001)},{acceptanceCriteria:['x'.repeat(501)]}]) expect(()=>parseGovernanceChange('software',{...change,...oversized})).toThrow();
    expect(()=>parseGovernanceChange('software',{...change,rule:'x'.repeat(1200),implementation:'x'.repeat(6000),acceptanceCriteria:['x'.repeat(500)]})).not.toThrow();
    expect(()=>parseGovernanceChange('software',{...change,acceptanceCriteria:new Array(1)})).toThrow();
  });
  it('copies rules and rejects no-op patches',()=>{
    expect(()=>applyWorldRuleChange(WORLD_RULE_DEFAULTS,{kind:'world_rules',rules:{maxObjectScale:60}})).toThrow();
    const next=applyWorldRuleChange(WORLD_RULE_DEFAULTS,{kind:'world_rules',rules:{charter:'Welcome'}});
    next.allowedShapes.pop();
    expect(WORLD_RULE_DEFAULTS.allowedShapes).toHaveLength(6);
    expect(WORLD_RULE_DEFAULTS.charter).toBe('');
    WORLD_RULE_DEFAULTS.allowedShapes.pop();
    expect(WORLD_RULE_DEFAULTS.allowedShapes).toHaveLength(6);
    expect(()=>applyWorldRuleChange(WORLD_RULE_DEFAULTS,{kind:'world_rules',rules:{allowedShapes:[...WORLD_RULE_DEFAULTS.allowedShapes].reverse()}})).toThrow();
    expect(()=>assertWorldRules({shape:'model',scale:[60,1,1]},WORLD_RULE_DEFAULTS)).not.toThrow();
    const narrowed=applyWorldRuleChange(WORLD_RULE_DEFAULTS,{kind:'world_rules',rules:{allowedShapes:['box'],maxObjectScale:2}});
    for(const object of [{shape:'model',scale:[1,1,1]},{shape:'box',scale:[3,1,1]},{shape:'box',scale:[NaN,1,1]},{shape:'box',scale:[0,1,1]},{shape:'box',scale:[1,1]}]) expect(()=>assertWorldRules(object,narrowed)).toThrow();
  });
  it('counts quorum and abstentions but rejects ties and empty electorates',()=>{
    expect(countVotes(['a','b','c'],[{agentId:'a',choice:'yes'},{agentId:'b',choice:'abstain'}])).toEqual({yes:1,no:0,abstain:1,total:2,quorum:2,voterCount:3,passed:true});
    expect(countVotes(['a','b','c'],[{agentId:'a',choice:'yes'}]).passed).toBe(false);
    expect(countVotes(['a','b'],[{agentId:'a',choice:'yes'},{agentId:'b',choice:'no'}]).passed).toBe(false);
    expect(countVotes(['a'],[{agentId:'a',choice:'abstain'}]).passed).toBe(false);
    expect(countVotes([],[]).passed).toBe(false);
    expect(()=>countVotes(['a','a'],[])).toThrow();
    expect(()=>countVotes(['a'],[{agentId:'b',choice:'yes'}])).toThrow();
    expect(()=>countVotes(['a'],[{agentId:'a',choice:'yes'},{agentId:'a',choice:'no'}])).toThrow();
  });
});
