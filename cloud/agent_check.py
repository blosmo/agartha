"""Run the public-agent acceptance flow from a separate cloud machine."""
import modal
app=modal.App("agartha-public-agent-check")

@app.function(image=modal.Image.debian_slim(python_version="3.12"),timeout=240)
def verify(base_url:str):
    import json, secrets, time, urllib.request, urllib.error, uuid
    token=secrets.token_hex(32)
    results={"base_url":base_url,"checks":[],"ok":False}
    def call(path,body=None,credential=token):
        headers={"Content-Type":"application/json"}
        if credential: headers["Authorization"]="Bearer "+credential
        request=urllib.request.Request(base_url.rstrip('/')+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
        try:
            with urllib.request.urlopen(request,timeout=115) as response:
                content=response.read()
                return response.status, json.loads(content) if "json" in response.headers.get("Content-Type","") else content, dict(response.headers)
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode()[:500], {}
    def require(condition,message):
        if not condition: raise RuntimeError(message)
        results["checks"].append(message)
    def nonce():return {"requestId":uuid.uuid4().hex,"issuedAt":int(time.time()*1000)}
    try:
        status,identity,_=call('/api/session',{"agentToken":token,"name":"Cloud verifier"},None)
        require(status==200,"Remote agent registration")
        status,grid,_=call('/api/plots?x=2&z=0')
        require(status==200 and bool(grid["empty"]),"Public neighborhood discovery")
        empty=grid["empty"][0]
        status,source,_=call('/api/plots',{"x":empty["x"],"z":empty["z"],"name":"Cloud-created studio"})
        require(status==200 and source["cloud"],"Cloud plot creation")
        path='/api/plots/'+source['id']
        request={**nonce(),"parameters":{"tool":"pavilion","size":4},"preview":True}
        status,proposal,_=call(path+'/tools',request)
        require(status==200 and proposal['objectCount']==7,"Builder proposal")
        status,unchanged,_=call(path)
        require(status==200 and len(unchanged['objects'])==0,"Proposal leaves geometry unchanged")
        status,built,_=call(path+'/tools',{**request,"preview":False})
        require(status==200 and len(built['objects'])==7,"Committed cloud build")
        status,replayed,_=call(path+'/tools',{**request,"preview":False})
        require(status==200 and len(replayed['objects'])==7,"Retry does not duplicate the build")
        status,shader,_=call('/api/library',{"plotId":source['id'],"definition":{"kind":"shader","name":"Cloud ocean surface","expression":"mix(color, vec3f(0.2, 0.5, 0.8), 0.5 + 0.5 * sin(position.y * 16.0))"}})
        require(status==200 and shader['id'].startswith('shader-'),"Remote shader publication")
        roof=next(o for o in built['objects'] if o['name']=='Pavilion roof')
        status,shaded,_=call(path,{**nonce(),"message":"Applied cloud ocean surface","expectedVersions":{roof['id']:built['objectVersions'][roof['id']]},"objects":[{**roof,"shaderId":shader['id']}]})
        require(status==200 and shaded['version']!=built['version'],"Versioned shader application")
        status,asset,_=call('/api/library',{"plotId":source['id'],"definition":{"kind":"asset","name":"Cloud-built pavilion","objects":shaded['objects']}})
        require(status==200 and asset['id'].startswith('asset-'),"Remote asset publication")
        status,neighbors,_=call('/api/plots?x='+str(empty['x'])+'&z='+str(empty['z']))
        target=neighbors['empty'][0]
        status,destination,_=call('/api/plots',{"x":target['x'],"z":target['z'],"name":"Cloud asset exchange"})
        require(status==200,"Second cloud plot creation")
        status,copied,_=call('/api/plots/'+destination['id']+'/assets',{**nonce(),"assetId":asset['id'],"parameters":{"heading":30},"preview":False})
        require(status==200 and len(copied['objects'])==7 and any(o.get('shaderId')==shader['id'] for o in copied['objects']),"Asset and shader reused across plots")
        status,still,_=call(path)
        require(status==200 and still['version']==shaded['version'],"Source plot remains unchanged")
        status,_,_=call(path,{**nonce(),"message":"Stale update","expectedVersions":{roof['id']:0},"objects":[roof]})
        require(status==409,"Stale edit rejected")
        other=secrets.token_hex(32)
        status,_,_=call('/api/session',{"agentToken":other,"name":"Ownership verifier"},None)
        require(status==200,"Independent second identity")
        status,_,_=call(path,{**nonce(),"message":"Forbidden edit","expectedVersions":{roof['id']:shaded['objectVersions'][roof['id']]},"objects":[roof]},other)
        require(status==403,"Cross-agent overwrite rejected")
        status,png,headers=call(path+'/preview')
        require(status==200 and isinstance(png,bytes) and png.startswith(b'\x89PNG\r\n\x1a\n'),"Real cloud-rendered PNG")
        results.update(ok=True,source_plot=source['id'],destination_plot=destination['id'],shader_id=shader['id'],asset_id=asset['id'],png_bytes=len(png),renderer=headers.get('X-Agartha-Renderer') or headers.get('x-agartha-renderer'))
    except Exception as error:
        results['error']=str(error)
    return {"report":results,"credentials":{"agentToken":token}}

@app.local_entrypoint()
def main(base_url:str):
    import json
    from pathlib import Path
    result=verify.remote(base_url)
    path=Path('.agartha/cloud-agent-check.json');path.write_text(json.dumps(result,indent=2));path.chmod(0o600)
    print(json.dumps(result['report'],indent=2))
