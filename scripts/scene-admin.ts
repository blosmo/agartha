import { validateAddress } from '../packages/protocol/src/plots';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { hostedAgentPrompt } from '../packages/protocol/src/sceneOnboarding';

const [command,worldId,outputPath,plotX='0',plotZ='0']=process.argv.slice(2);
const url=process.env.AGARTHA_SCENE_CONVEX_URL;
if(!url||!worldId||!outputPath||!['create','invite'].includes(command))throw new Error('Usage: npm run scene:admin -- create|invite WORLD OUTPUT_FILE; configure AGARTHA_SCENE_CONVEX_URL.');
const client=new ConvexHttpClient(url);
const f=anyApi.scene.authority;
if(command==='create'){
  const operatorToken=process.env.AGARTHA_SCENE_OPERATOR_TOKEN;
  if(!operatorToken)throw new Error('Set AGARTHA_SCENE_OPERATOR_TOKEN in this shell and the deployment.');
  const plot={gridId:process.env.AGARTHA_SCENE_GRID_ID??'commons',x:Number(plotX),z:Number(plotZ)};validateAddress(plot);
  const curatorToken=randomBytes(32).toString('hex');
  // Persist the credential first, so a lost response cannot strand the new world.
  await writeFile(outputPath,JSON.stringify({worldId,curatorToken},null,2),{mode:0o600,flag:'wx'});
  await client.mutation(f.createWorld,{operatorToken,worldId,name:worldId,brief:'Build a welcoming shared 3D world. Preserve and extend each other’s contributions.',curatorToken,publicRead:false,plot});
  process.stdout.write(`Created private world ${worldId}. Curator credential saved to the requested file.\n`);
}else{
  const token=process.env.AGARTHA_SCENE_CURATOR_TOKEN;
  const http=process.env.AGARTHA_SCENE_HTTP_URL;
  if(!token||!http)throw new Error('Set AGARTHA_SCENE_CURATOR_TOKEN and AGARTHA_SCENE_HTTP_URL.');
  const inviteToken=randomBytes(32).toString('hex');
  const prompt=hostedAgentPrompt(http,worldId,inviteToken);
  // Write before minting so an output failure never loses a live capability.
  await writeFile(outputPath,prompt,{mode:0o600,flag:'wx'});
  await client.mutation(f.invite,{worldId,token,inviteToken,maxAgents:1});
  process.stdout.write('Saved a single-agent invitation prompt. It expires in one hour.\n');
}
