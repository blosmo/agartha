import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Explicitly opt-in: this creates objects in the designated staging world.
if(process.env.AGARTHA_SCENE_LOAD_TARGET!=='staging')throw new Error('Set AGARTHA_SCENE_LOAD_TARGET=staging before running a write load test.');
const base=process.env.AGARTHA_SCENE_HTTP_URL;
const file=process.argv[2];
if(!base?.startsWith('https://')||!file)throw new Error('Set AGARTHA_SCENE_HTTP_URL and supply a JSON file of {worldId,token} agent credentials.');
const agents: Array<{worldId:string;token:string}>=JSON.parse(await readFile(file,'utf8'));
if(!Array.isArray(agents)||!agents.length||agents.length>10000||!agents.every(a=>/^[a-zA-Z0-9_-]{1,80}$/.test(a.worldId)&&/^[a-f0-9]{64}$/.test(a.token)))throw new Error('Expected 1–10,000 valid agent credentials.');
const concurrency=Number(process.env.AGARTHA_SCENE_LOAD_CONCURRENCY??100);
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>256)throw new Error('Concurrency must be 1–256.');
const objectsPerEdit=Number(process.env.AGARTHA_SCENE_LOAD_OBJECTS_PER_EDIT??1);
if(!Number.isInteger(objectsPerEdit)||objectsPerEdit<1||objectsPerEdit>20)throw new Error('Objects per edit must be 1–20.');
const run=randomUUID().slice(0,8),latencies:number[]=[];
const statuses:Record<string,number>={};let cursor=0,verified=0;
const started=performance.now();
await Promise.all(Array.from({length:Math.min(concurrency,agents.length)},async()=>{
  for(;;){
    const i=cursor++;if(i>=agents.length)break;
    const {worldId,token}=agents[i];const id=`load-${run}-${i}`;
    const url=`${new URL(base).origin}/v2/worlds/${worldId}`;
    const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
    const changes=Array.from({length:objectsPerEdit},(_,j)=>{const objectId=`${id}-${j}`;return {id:objectId,expectedVersion:0,object:{id:objectId,name:'Staging test marker',shape:'box',position:[(i%100)*32+j*.5,0,Math.floor(i/100)*32],scale:[.4,1,.4],color:'#aaccaa'}};});
    const start=performance.now();
    try {
      const response=await fetch(`${url}/edit`,{method:'POST',headers,signal:AbortSignal.timeout(15000),body:JSON.stringify({requestId:id,issuedAt:Date.now(),message:'Staging load-test contribution',changes})});
      statuses[String(response.status)]=(statuses[String(response.status)]??0)+1;
      if(response.ok){
        const read=await fetch(`${url}/inspect?ids=${changes.map(change=>change.id).join(',')}`,{headers,signal:AbortSignal.timeout(15000)});
        if(read.ok){const result=await read.json();if(result.length===changes.length&&changes.every(change=>result.some((row:{version:number;object?:{id:string}})=>row.version===1&&row.object?.id===change.id)))verified++;}
      }
    }catch{statuses.network_error=(statuses.network_error??0)+1;}
    finally{latencies.push(performance.now()-start);}
  }
}));
const elapsed=(performance.now()-started)/1000;
latencies.sort((a,b)=>a-b);
process.stdout.write(JSON.stringify({agents:agents.length,concurrency,objectsPerEdit,verified,verifiedObjects:verified*objectsPerEdit,statuses,elapsedSeconds:elapsed,verifiedEditsPerSecond:verified/elapsed,p50Ms:latencies[Math.floor(latencies.length*.5)],p95Ms:latencies[Math.min(latencies.length-1,Math.floor(latencies.length*.95))]},null,2)+'\n');
if(verified!==agents.length)process.exitCode=1;
