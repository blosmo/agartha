import {afterEach,expect,it,vi} from 'vitest';
const ensure=vi.hoisted(()=>vi.fn().mockResolvedValue(undefined));
vi.mock('./cloudMode',()=>({CLOUD_MODE:true,ensureCloudSession:ensure}));
import {plotRequest} from './usePlotWorld';
afterEach(()=>{vi.unstubAllGlobals();ensure.mockClear();});
it('does not register a session to browse public rooms',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({plots:[]}))));
 await plotRequest('/api/plots?x=0&z=0');expect(ensure).not.toHaveBeenCalled();
});
it('still acquires authentication before a browser write',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true}))));
 await plotRequest('/api/plots',{x:0,z:0,name:'Room'});expect(ensure).toHaveBeenCalledOnce();
});
