export const CLOUD_MODE = import.meta.env.VITE_CLOUD_MODE === 'true';
let sessionReady:Promise<void>|undefined;
export function ensureCloudSession(){
  if(!CLOUD_MODE)return Promise.resolve();
  sessionReady??=fetch('/api/session',{signal:AbortSignal.timeout(25000),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).then(async response=>{if(!response.ok){const value=await response.json().catch(()=>({}));throw new Error(value.error??'Unable to start a cloud session.');}}).catch(error=>{sessionReady=undefined;throw error;});
  return sessionReady;
}
