import {expect,it} from 'vitest';
import {parseGovernanceAdminArgs,validateGovernanceDeployment} from './governance-admin';
it('requires an observed roster version and unique registered identity IDs',()=>{
 expect(parseGovernanceAdminArgs(['0','agent-one','agent-two'])).toEqual({expectedVersion:0,agentIds:['agent-one','agent-two']});
 for(const args of [[],['-1','agent-one'],['1.5','agent-one'],['0'],['0','agent-one','agent-one'],['0','bad/id']])expect(()=>parseGovernanceAdminArgs(args)).toThrow();
});
it('never sends an operator credential to an arbitrary or insecure deployment URL',()=>{
 expect(validateGovernanceDeployment('https://example.convex.cloud')).toBe('https://example.convex.cloud');
 for(const url of ['http://example.convex.cloud','https://convex.cloud.evil.example','https://user:password@example.convex.cloud','https://example.convex.cloud/path','https://example.convex.cloud?token=secret'])expect(()=>validateGovernanceDeployment(url)).toThrow();
});
