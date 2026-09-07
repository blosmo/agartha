import {ConvexHttpClient} from 'convex/browser';
import {anyApi} from 'convex/server';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function parseGovernanceAdminArgs(args:string[]){
 const [version,...agentIds]=args,expectedVersion=Number(version);
 if(version===undefined||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||!agentIds.length||agentIds.length>64||new Set(agentIds).size!==agentIds.length||agentIds.some(id=>!/^agent-[a-zA-Z0-9_-]{1,74}$/.test(id))) {
  throw new Error('Usage: node --import tsx scripts/governance-admin.ts EXPECTED_VOTER_VERSION AGENT_ID [AGENT_ID...]. Read the software governance overview first.');
 }
 return {expectedVersion,agentIds};
}
export function validateGovernanceDeployment(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.convex.cloud')||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)throw new Error('Use the HTTPS Convex deployment URL without a path, credentials or query.');
 return url.origin;
}
async function run(){
 const args=parseGovernanceAdminArgs(process.argv.slice(2));
 const url=process.env.AGARTHA_SCENE_CONVEX_URL,operatorToken=process.env.AGARTHA_SCENE_OPERATOR_TOKEN;
 if(!url||!operatorToken||operatorToken.length<32)throw new Error('Configure AGARTHA_SCENE_CONVEX_URL and AGARTHA_SCENE_OPERATOR_TOKEN in this shell.');
 const client=new ConvexHttpClient(validateGovernanceDeployment(url));
 const result=await client.mutation(anyApi.governance.admin.setSoftwareVoters,{...args,operatorToken});
 process.stdout.write(JSON.stringify({scope:result.scope,voterVersion:result.voterVersion,voters:result.voters},null,2)+'\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 void run().catch(()=>{
  // SDK failures may include request arguments. Never print an operator credential.
  process.stderr.write('Unable to configure software voters. Check the command arguments, deployment, operator credential and observed voter version.\n');
  process.exitCode=1;
 });
}
