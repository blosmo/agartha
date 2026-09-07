"""Production acceptance of durable identity and room lifecycle from a cloud machine."""
import modal
app=modal.App('agartha-lifecycle-check')

@app.function(image=modal.Image.debian_slim(python_version='3.12'),timeout=180)
def verify(base_url:str):
    import json,secrets,time,uuid,urllib.request,urllib.error
    token,recovery,new_token,other=[secrets.token_hex(32) for _ in range(4)]
    report={'ok':False,'checks':[],'base_url':base_url}
    def call(path,body=None,auth=None,cookie=None):
        headers={'Content-Type':'application/json'}
        if auth:headers['Authorization']='Bearer '+auth
        if cookie:headers['Cookie']=cookie
        req=urllib.request.Request(base_url+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
        try:
            with urllib.request.urlopen(req,timeout=115) as r:
                raw=r.read();return r.status,json.loads(raw) if 'json' in r.headers.get('Content-Type','') else raw
        except urllib.error.HTTPError as e:return e.code,None
    def check(value,label):
        if not value:raise RuntimeError(label)
        report['checks'].append(label)
    def nonce():return {'requestId':uuid.uuid4().hex,'issuedAt':int(time.time()*1000)}
    try:
        code,actor=call('/api/session',{'agentToken':token,'recoveryToken':recovery,'name':'Durability verifier'})
        check(code==200 and actor['recoveryConfigured'],'Recovery enrollment')
        code,grid=call('/api/plots?x=5&z=-1&view=summary',cookie='__Host-agartha_session=expired')
        check(code==200 and bool(grid['empty']) and 'objects' not in json.dumps(grid),'Anonymous lightweight discovery with stale cookie')
        cell=grid['empty'][0]
        code,room=call('/api/plots',{'x':cell['x'],'z':cell['z'],'name':'Durability verification'},token)
        check(code==200,'Create room at discovered coordinates');path='/api/plots/'+room['id'];location=room['location']
        own={'id':'owner-chair','name':'Owner chair','shape':'box','position':[-5,1,-5],'scale':[1,1,1],'color':'#aabbcc'}
        code,saved=call(path,{**nonce(),'message':'Owner contribution','expectedVersions':{own['id']:0},'objects':[own]},token)
        check(code==200,'Owner contribution saved')
        code,_=call('/api/session',{'agentToken':other,'name':'Collaborator verifier'})
        check(code==200,'Independent collaborator')
        obj={**own,'id':'guest-chair','position':[5,1,5]}
        code,_=call(path,{**nonce(),'message':'Guest contribution','expectedVersions':{obj['id']:0},'objects':[obj]},other)
        check(code==200,'Collaborator contribution saved')
        code,rotated=call('/api/session/rotate',{'newToken':new_token},token)
        check(code==200 and rotated['agentId']==actor['agentId'],'Rotation preserves stable identity')
        code,_=call('/api/session',{'agentToken':token,'name':'Retired key'})
        check(code==401,'Retired key cannot re-register')
        code,_=call(path,auth=token);check(code==401,'Old key rejected')
        code,updated=call(path,{**nonce(),'message':'Edit after rotation','expectedVersions':{own['id']:1},'objects':[{**own,'color':'#ffffff'}]},new_token)
        check(code==200 and updated['objectVersions'][own['id']]==2 and updated['permissions']['canManageRoom'],'Ownership and curation survive rotation')
        code,renewed=call('/api/session/renew',{'agentId':actor['agentId'],'recoveryToken':recovery})
        check(code==200 and renewed['agentId']==actor['agentId'],'Separate recovery proof renews the same identity')
        code,_=call(path+'/lifecycle',{'expectedVersion':1,'archived':True},other)
        check(code==403,'Collaborator cannot archive')
        code,state=call(path+'/lifecycle',{'expectedVersion':1,'name':'Renamed durable room','archived':True},new_token)
        check(code==200,'Creator rename and archive')
        code,grid=call(f"/api/plots?x={cell['x']}&z={cell['z']}&view=summary")
        check(code==200 and any(p['id']==room['id'] for p in grid['archived']) and not any(p['id']==room['id'] for p in grid['empty']),'Archived coordinate remains reserved')
        code,_=call(path,{**nonce(),'message':'Blocked','expectedVersions':{obj['id']:1},'remove':[obj['id']]},other)
        check(code==403,'Archived room rejects writes')
        code,_=call(path+'/lifecycle',{'expectedVersion':2,'archived':False},new_token);check(code==200,'Restore same room')
        code,restored=call(path,auth=new_token)
        check(code==200 and len(restored['objects'])==2 and restored['location']==location,'Objects and spatial location survive lifecycle')
        x,_,z=location['origin'];code,resolved=call(f'/api/spatial?x={x}&y=1&z={z}')
        check(code==200 and resolved['roomId']==room['id'] and resolved['position']==[0,1,0],'World coordinates resolve to stable room-local position')
        code,proposal=call(path+'/tools',{**nonce(),'parameters':{'tool':'pavilion'},'preview':True},new_token)
        check(code==200 and 'baseRevision' not in proposal and bool(proposal['snapshotVersion']),'Proposal exposes real snapshot version')
        code,png=call(path+'/preview',auth=new_token);check(code==200 and png.startswith(b'\x89PNG'),'Cloud rendering after rotation and restore')
        code,_=call(path+'/lifecycle',{'expectedVersion':3,'archived':True},new_token);check(code==200,'Verification room left archived with data intact')
        report.update(ok=True,room_id=room['id'],location=location,png_bytes=len(png))
    except Exception as error:report['error']=str(error)
    return {'report':report,'credentials':{'agentToken':new_token,'originalToken':token,'recoveryToken':recovery,'collaboratorToken':other}}

@app.local_entrypoint()
def main(base_url:str):
    import json,os
    result=verify.remote(base_url)
    fd=os.open('.agartha/lifecycle-check.json',os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as f:json.dump(result,f,indent=2)
    print(json.dumps(result['report'],indent=2))
