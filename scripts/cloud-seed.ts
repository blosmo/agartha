import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';

function run(name:string,args:unknown){
  const result=spawnSync('npx',['convex','run','--prod',name,JSON.stringify(args)],{encoding:'utf8',maxBuffer:2_000_000});
  if(result.status!==0)throw new Error(`Cloud bootstrap failed for ${name}: ${result.stderr.slice(-1500)}`);
}
const libraryFiles=(await readdir('.agartha/library')).filter(file=>/^(asset|shader)-[a-f0-9]{64}\.json$/.test(file));
const entries=await Promise.all(libraryFiles.map(async file=>JSON.parse(await readFile(join('.agartha/library',file),'utf8'))));
run('cloud/write:bootstrapLibrary',{entries});
const plots=[JSON.parse(await readFile('.agartha/world.json','utf8')),...await Promise.all((await readdir('.agartha/plots')).filter(file=>/^plot--?\d+--?\d+\.json$/.test(file)).map(async file=>JSON.parse(await readFile(join('.agartha/plots',file),'utf8'))))];
for(const world of plots)run('cloud/write:bootstrapPlot',{world});
process.stdout.write(JSON.stringify({publicPlots:plots.length,libraryEntries:entries.length,credentialsIncluded:false})+'\n');
