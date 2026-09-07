import {useEffect,useState} from 'react';
import {normalizeMesh,type MeshGeometry} from '../../../../packages/protocol/src/geometry/mesh';
const cache=new Map<string,Promise<MeshGeometry>>();
function load(id:string){
  let pending=cache.get(id);
  if(!pending){
    pending=fetch(`/api/library/${id}`,{signal:AbortSignal.timeout(15000)}).then(async response=>{
      if(!response.ok)throw new Error(`Mesh request failed (${response.status}).`);
      const entry=await response.json();if(entry.kind!=='mesh'||entry.id!==id)throw new Error('Invalid mesh library response.');
      return normalizeMesh(entry.geometry);
    }).catch(error=>{cache.delete(id);throw error;});
    cache.set(id,pending);
    while(cache.size>64)cache.delete(cache.keys().next().value!);
  }
  return pending;
}
export function useMeshLibrary(ids:readonly string[]){
  const key=[...new Set(ids)].sort().join(',');
  const [geometry,setGeometry]=useState(new Map<string,MeshGeometry>());
  const [error,setError]=useState('');const [loading,setLoading]=useState(false);
  useEffect(()=>{
    let cancelled=false;setError('');setLoading(Boolean(key));
    const requested=key?key.split(','):[];
    Promise.allSettled(requested.map(async id=>[id,await load(id)] as const)).then(results=>{
      if(cancelled)return;
      const entries=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
      setGeometry(new Map(entries));
      if(results.some(result=>result.status==='rejected'))setError('Some model geometry could not load.');
      setLoading(false);
    });
    return()=>{cancelled=true;};
  },[key]);
  return {geometry,error,loading};
}
