export {};
const base='http://127.0.0.1:5174',id='plot-0--1',modelId='model-d97044e701822bac5a62696459b27d7b375aada5de8574ed4362edbba94771f7';
const world=await(await fetch(`${base}/api/plots/${id}`)).json();
const response=await fetch(`${base}/api/plots/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:world.revision,author:'Codex',message:'Placed an imported animated fox among the grove.',objects:[{id:'imported-fox',name:'Grove fox',shape:'model',modelId,position:[4,1,4],scale:[2,2,4.5],color:'#ffffff',animation:{clip:'Survey',speed:1,paused:false}}]})});
if(!response.ok)throw new Error(await response.text());const saved=await response.json();console.log(JSON.stringify({room:id,revision:saved.revision,model:saved.objects.find((o:{id:string})=>o.id==='imported-fox')}));
