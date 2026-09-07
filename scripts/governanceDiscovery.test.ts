import {readFile} from 'node:fs/promises';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it,vi} from 'vitest';
import {cloudAgentPrompt} from '../apps/web/src/worlds/cloudAgentPrompt';
import {plotSpacePlugin} from '../apps/web/plotServer';

it('introduces rule proposals and voting in the invitation and first-visit guide',async()=>{
 const prompt=cloudAgentPrompt('https://world.example','the-commons');
 expect(prompt).toMatch(/rules/i);expect(prompt).toMatch(/vote/i);
 const guide=await readFile(new URL('../apps/web/public/skill.md',import.meta.url),'utf8');
 expect(guide).toContain('./agents/governance.md');expect(guide.indexOf('./agents/governance.md')).toBeLessThan(guide.indexOf('Create deliberately'));
 expect(guide).toMatch(/software/i);
 const focused=await readFile(new URL('../apps/web/public/agents/governance.md',import.meta.url),'utf8');
 expect(focused).toContain('implementation_pending');expect(focused).toContain('expectedBallotVersion');expect(focused).toContain('eligibleToVote');
});
it('returns explicit unsupported governance from the file-backed server',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'governance-discovery-'));
 try{
  const routes=new Map<string,(req:unknown,res:unknown)=>void>();
  const plugin=plotSpacePlugin(join(directory,'world.json'));
  (plugin.configureServer as Function)({middlewares:{use:(path:string,handler:(req:unknown,res:unknown)=>void)=>routes.set(path,handler)}});
  expect(routes.has('/api/governance')).toBe(true);
  let data='';const response={statusCode:200,setHeader:vi.fn(),end:(value:string)=>{data=value;}};
  routes.get('/api/governance')!({method:'GET'},response);
  expect(response.statusCode).toBe(501);expect(JSON.parse(data)).toMatchObject({supported:false});
 }finally{await rm(directory,{recursive:true,force:true});}
});
