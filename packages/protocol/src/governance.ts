import {addressFromId} from './plots';

export const GOVERNANCE_SHAPES = ['box','sphere','cone','cylinder','mesh','model'] as const;
export type GovernanceShape = typeof GOVERNANCE_SHAPES[number];
export type GovernanceScope = 'software' | `world:${string}`;
export type WorldRules = {charter:string;allowedShapes:GovernanceShape[];maxObjectScale:number};
// Each access returns its own array so callers cannot alter the default shape list.
export const WORLD_RULE_DEFAULTS:WorldRules = Object.freeze({charter:'',get allowedShapes(){return [...GOVERNANCE_SHAPES];},maxObjectScale:60});
export type GovernanceChange = {kind:'world_rules';rules:Partial<WorldRules>} | {kind:'software';rule:string;implementation:string;acceptanceCriteria:string[]};
export type GovernanceChoice = 'yes'|'no'|'abstain';
export type GovernanceStatus = 'draft'|'open'|'active'|'implementation_pending'|'rejected'|'superseded'|'withdrawn';
export type GovernanceVoter = {agentId:string;name:string};
export type GovernanceBallot = GovernanceVoter & {choice:GovernanceChoice;version:number;updatedAt:number};
export type GovernanceTally = {yes:number;no:number;abstain:number;total:number;quorum:number;voterCount:number;passed:boolean};
export type GovernanceVotingPolicy = {version:1;quorum:number;approval:'majority'};
export type GovernanceDiscovery = {supported:boolean;scope:GovernanceScope;guide:string;overview:string;proposals:string;eligibleToVote:boolean;canPropose:boolean;rosterReady:boolean};
export type GovernanceScopeView = {
  scope:GovernanceScope;kind:'software'|'world';label:string;supported:true;guide:string;
  rules:WorldRules|null;rulesVersion:number;voterVersion:number;voters:GovernanceVoter[];
  voting:{durationHours:24;quorumFraction:0.5;approval:'majority';rosterReady:boolean};
  permissions:{agentId:string|null;canPropose:boolean;canManageVoters:boolean;eligibleToVote:boolean};proposals:string;
};
export type SoftwareImplementationRequest = {proposalId:string;scope:GovernanceScope;title:string;rule:string;implementation:string;acceptanceCriteria:string[];repository:string;status:'implementation_pending'};
export type GovernanceProposalView = {
  id:string;scope:GovernanceScope;revision:number;status:GovernanceStatus;title:string;rationale:string;
  change:GovernanceChange;author:GovernanceVoter;createdAt:number;updatedAt:number;openedAt:number|null;closesAt:number|null;
  baseRulesVersion:number;eligibleVoters:GovernanceVoter[];ballots:GovernanceBallot[];tally:GovernanceTally;outcomeReason:string|null;
  votingPolicy?:GovernanceVotingPolicy|null;finalTally?:GovernanceTally|null;
  permissions:{canEdit:boolean;canOpen:boolean;canVote:boolean;canWithdraw:boolean;canFinalize:boolean};implementation:SoftwareImplementationRequest|null;
};
export type GovernanceComment = {id:string;proposalId:string;author:GovernanceVoter;text:string;createdAt:number};
export type GovernancePage<T> = {page:T[];continueCursor:string|null;isDone:boolean};

export function parseGovernanceScope(value:unknown):GovernanceScope {
  if(value==='software') return value;
  if(typeof value!=='string'||!value.startsWith('world:')) throw new Error('Choose a software or canonical public world scope.');
  addressFromId(value.slice(6));
  return value as GovernanceScope;
}
function record(value:unknown,label:string):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)) throw new Error(`${label} must be an object.`);
  return value as Record<string,unknown>;
}
function keys(value:Record<string,unknown>,allowed:readonly string[]) {
  if(Reflect.ownKeys(value).some(key=>typeof key!=='string'||!allowed.includes(key))) throw new Error('Unknown governance field.');
}
function requiredText(value:unknown,label:string,max:number):string {
  if(typeof value!=='string'||!value.trim()) throw new Error(`${label} must not be empty.`);
  if(value.length>max) throw new Error(`${label} must be at most ${max} characters.`);
  return value;
}
function parseRules(value:unknown):Partial<WorldRules> {
  const input=record(value,'Rules');keys(input,['charter','allowedShapes','maxObjectScale']);
  if(!Object.keys(input).length) throw new Error('Provide at least one rule change.');
  const rules:Partial<WorldRules>={};
  if(Object.hasOwn(input,'charter')) {
    if(typeof input.charter!=='string'||input.charter.length>1200) throw new Error('Charter must be at most 1200 characters.');
    rules.charter=input.charter;
  }
  if(Object.hasOwn(input,'allowedShapes')) {
    const shapes=input.allowedShapes;
    if(!Array.isArray(shapes)||!shapes.length||shapes.length>6||new Set(shapes).size!==shapes.length||!Array.from(shapes).every(shape=>GOVERNANCE_SHAPES.includes(shape))) throw new Error('Choose a nonempty unique set of supported shapes.');
    rules.allowedShapes=[...shapes];
  }
  if(Object.hasOwn(input,'maxObjectScale')) {
    const scale=input.maxObjectScale;
    if(typeof scale!=='number'||!Number.isFinite(scale)||scale<0.1||scale>60) throw new Error('Maximum object scale must be between 0.1 and 60.');
    rules.maxObjectScale=scale;
  }
  return rules;
}
export function parseGovernanceChange(scope:GovernanceScope,value:unknown):GovernanceChange {
  parseGovernanceScope(scope);
  const input=record(value,'Change');
  if(scope!=='software') {
    keys(input,['kind','rules']);
    if(input.kind!=='world_rules') throw new Error('World scopes require a world rule change.');
    return {kind:'world_rules',rules:parseRules(input.rules)};
  }
  keys(input,['kind','rule','implementation','acceptanceCriteria']);
  if(input.kind!=='software') throw new Error('Software scope requires a software change.');
  const criteria=input.acceptanceCriteria;
  if(!Array.isArray(criteria)||criteria.length<1||criteria.length>10) throw new Error('Provide 1–10 acceptance criteria.');
  return {kind:'software',rule:requiredText(input.rule,'Rule',1200),implementation:requiredText(input.implementation,'Implementation',6000),acceptanceCriteria:Array.from(criteria,criterion=>requiredText(criterion,'Acceptance criterion',500))};
}
export function applyWorldRuleChange(current:WorldRules,change:Extract<GovernanceChange,{kind:'world_rules'}>):WorldRules {
  const parsed=parseGovernanceChange('world:the-commons',change) as Extract<GovernanceChange,{kind:'world_rules'}>;
  const next={...current,...parsed.rules,allowedShapes:[...(parsed.rules.allowedShapes??current.allowedShapes)]};
  parseRules(next);
  if(next.charter===current.charter&&next.maxObjectScale===current.maxObjectScale&&next.allowedShapes.length===current.allowedShapes.length&&next.allowedShapes.every(shape=>current.allowedShapes.includes(shape))) throw new Error('The proposal must change current rules.');
  return next;
}
export function assertWorldRules(object:{shape:string;scale:readonly number[]},rules:WorldRules):void {
  if(!rules.allowedShapes.includes(object.shape as GovernanceShape)) throw new Error('This shape is not allowed by the world rules.');
  if(object.scale.length!==3||!Array.from(object.scale).every(value=>Number.isFinite(value)&&value>0&&value<=rules.maxObjectScale)) throw new Error('Object scale exceeds the world rules or is invalid.');
}
export function countVotes(voters:readonly string[],ballots:readonly {agentId:string;choice:GovernanceChoice}[]):GovernanceTally {
  const electorate=new Set(voters);
  if(voters.length>64||electorate.size!==voters.length||!Array.from(voters).every(id=>typeof id==='string'&&id.trim().length>0)) throw new Error('Invalid governance electorate.');
  const tally:GovernanceTally={yes:0,no:0,abstain:0,total:0,quorum:Math.ceil(voters.length/2),voterCount:voters.length,passed:false};
  const cast=new Set<string>();
  for(const ballot of ballots) {
    if(!electorate.has(ballot.agentId)||cast.has(ballot.agentId)||!['yes','no','abstain'].includes(ballot.choice)) throw new Error('Invalid or duplicate governance ballot.');
    cast.add(ballot.agentId);tally[ballot.choice]++;tally.total++;
  }
  tally.passed=tally.total>=tally.quorum&&tally.yes>tally.no;
  return tally;
}
export function governanceLinks(scope:GovernanceScope):{scope:GovernanceScope;guide:string;overview:string;proposals:string} {
  parseGovernanceScope(scope);
  const query=`scope=${encodeURIComponent(scope)}`;
  return {scope,guide:'/agents/governance.md',overview:`/api/governance?${query}`,proposals:`/api/governance/proposals?${query}`};
}
