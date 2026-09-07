import {afterEach,expect,it,vi} from 'vitest';
import handler from '../api/index';

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function setup(){
 vi.stubEnv('AGARTHA_CONVEX_SITE_URL','https://example.convex.site');
 vi.stubEnv('AGARTHA_CLOUD_GATEWAY_KEY','test-gateway-key');
 const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({supported:true})));
 vi.stubGlobal('fetch',fetcher);return fetcher;
}
function response(){let body='';return {statusCode:200,setHeader:vi.fn(),end(value:string){body=value;},get body(){return body;}};}
it('forwards governance discovery with the browser identity and scope',async()=>{
 const fetcher=setup(),res=response();
 await handler({method:'GET',headers:{host:'world.example',cookie:'__Host-agartha_session=private-agent'},query:{path:'governance',scope:'world:the-commons'}} as never,res as never);
 expect(res.statusCode).toBe(200);expect(fetcher).toHaveBeenCalledTimes(1);
 const [url,init]=fetcher.mock.calls[0];expect(String(url)).toBe('https://example.convex.site/cloud/governance?scope=world%3Athe-commons');
 expect(init.headers.Authorization).toBe('Bearer private-agent');expect(res.body).not.toContain('private-agent');
});
it.each(['open','vote','withdraw','finalize','comments'])('forwards only the supported proposal action %s',async action=>{
 const fetcher=setup(),res=response();
 await handler({method:'POST',headers:{host:'world.example','content-type':'application/json',authorization:'Bearer private-agent'},query:{path:`governance/proposals/rule-one/${action}`},body:{requestId:'one',expectedRevision:2}} as never,res as never);
 expect(res.statusCode).toBe(200);expect(String(fetcher.mock.calls[0][0])).toBe(`https://example.convex.site/cloud/governance/proposals/rule-one/${action}`);
});
it('retains the cross-origin cookie write rejection for ballots',async()=>{
 const fetcher=setup(),res=response();
 await handler({method:'POST',headers:{host:'world.example','content-type':'application/json',origin:'https://untrusted.example',cookie:'__Host-agartha_session=private-agent'},query:{path:'governance/proposals/rule-one/vote'},body:{requestId:'one',choice:'yes',expectedRevision:2,expectedBallotVersion:0}} as never,res as never);
 expect(res.statusCode).toBe(403);expect(fetcher).not.toHaveBeenCalled();
});
it.each(['governance/admin','governance/proposals/rule-one/execute','governance/proposals/rule-one/vote/extra'])('rejects unsupported authority path %s',async path=>{
 const fetcher=setup(),res=response();
 await handler({method:'GET',headers:{host:'world.example',authorization:'Bearer private-agent'},query:{path}} as never,res as never);
 expect(res.statusCode).toBe(404);expect(fetcher).not.toHaveBeenCalled();
});
