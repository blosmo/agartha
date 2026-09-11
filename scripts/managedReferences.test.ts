import { describe, it, expect, vi } from 'vitest';
import { referenceRequest, generateReference, REFERENCE_MODEL } from '../packages/modeling/references';
import { studioRequest, parseStudioAction } from '../packages/modeling/studio';
import type { LedgerCall } from '../packages/billing/ledgerClient';
const input = { jobId: 'job', executorId: 'worker', operationId: 'worker-reference', brief: 'A coastal observatory', remainingCents: 835 };
const ledger = () => vi.fn(async (name: string) => name === 'claimManagedInference' ? { claimed: true } : {});
const image = Buffer.concat([Buffer.from([255,216,255]), Buffer.alloc(120)]).toString('base64');
const response = () => Response.json({ usage: { input_tokens: 1000, output_tokens: 2500, input_tokens_details: { image_tokens: 0 } }, data: [{ b64_json: image }] });

describe('Flare references', () => {
  it('pins one explicit Flare image and leaves allowance for modeling', () => {
    const request = referenceRequest(input);
    expect(request.body).toMatchObject({ model: 'openai/gpt-image-2.5-flare', n: 1, size: '1536x1536', providerOptions: { openai: { quality: 'high', outputFormat: 'jpeg', outputCompression: 85 } } });
    expect(request.maxCostCents).toBeLessThan(50);
    expect(() => referenceRequest({ ...input, remainingCents: 100 })).toThrow('modeling');
    expect(() => referenceRequest({ ...input, brief: 'x'.repeat(4001) })).toThrow('brief');
  });
  it('reserves before dispatch and settles image-token usage', async () => {
    const call = ledger(), fetcher = vi.fn().mockResolvedValue(response());
    const result = await generateReference(input, call as LedgerCall, 'credential', fetcher);
    expect(result).toMatchObject({ model: REFERENCE_MODEL, chargeCents: 8 });
    expect(call.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[0]);
    expect(call.mock.calls[0]).toEqual(['claimManagedInference', expect.objectContaining({ kind: 'reference' })]);
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ chargeCents: 8 }));
    expect(fetcher.mock.calls[0][0]).toBe('https://ai-gateway.vercel.sh/v1/images/generations');
  });
  it('settles known usage before rejecting an unexpected large PNG', async () => {
    const call = ledger();
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71]), Buffer.alloc(3_700_000)]).toString('base64');
    const fetcher = vi.fn().mockResolvedValue(Response.json({ usage: { input_tokens: 467, output_tokens: 2511 }, data: [{ b64_json: png }] }));
    await expect(generateReference(input, call as LedgerCall, 'credential', fetcher)).rejects.toThrow('usable reference');
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ chargeCents: 8 }));
  });
  it('does not retry or fabricate usage for ambiguous requests', async () => {
    const call = ledger(), fetcher = vi.fn().mockRejectedValue(new Error('connection lost'));
    await expect(generateReference(input, call as LedgerCall, 'credential', fetcher)).rejects.toThrow('uncertain');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ ambiguous: true }));
  });
  it('refuses duplicate operations before contacting the provider', async () => {
    const fetcher = vi.fn();
    await expect(generateReference(input, vi.fn(async () => ({ claimed: false })) as LedgerCall, 'credential', fetcher)).rejects.toThrow('already dispatched');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('settles explicit rejection at zero but holds unknown usage', async () => {
    const call = ledger();
    await expect(generateReference(input, call as LedgerCall, 'credential', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))).rejects.toThrow('unavailable');
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ chargeCents: 0 }));
    await expect(generateReference(input, call as LedgerCall, 'credential', vi.fn().mockResolvedValue(Response.json({ data: [] })))).rejects.toThrow('reconciliation');
    expect(call).toHaveBeenLastCalledWith('completeManagedInference', expect.objectContaining({ ambiguous: true }));
  });
});

describe('reference-guided Blender actions', () => {
  it('validates material operations and requires portable authorship metadata',()=>{
    const action={action:'search_materials',code:JSON.stringify({q:'wood',injected:'discard'}),objectName:'',views:[],summary:'Search',critique:''};
    expect(JSON.parse(parseStudioAction(action).code)).toEqual({q:'wood'});
    expect(()=>parseStudioAction({...action,code:'import os'})).toThrow('material parameters');
    expect(()=>parseStudioAction({...action,action:'load_material',objectName:'Wall',code:JSON.stringify({id:'https://private.invalid'})})).toThrow();
    const metadata={name:'Oak',description:'Weathered boards',tags:['wood'],license:'CC0-1.0',attribution:'',recipe:'Native Noise and Brick nodes',tileSize:2,resolution:512};
    expect(JSON.parse(parseStudioAction({...action,action:'prepare_material',objectName:'Wall',code:JSON.stringify(metadata)}).code)).toEqual(metadata);
    expect(()=>parseStudioAction({...action,action:'prepare_material',objectName:'Wall',code:JSON.stringify({...metadata,resolution:'512'})})).toThrow();
    expect(()=>parseStudioAction({...action,action:'prepare_material',objectName:'Wall',code:JSON.stringify({...metadata,license:'private'})})).toThrow();
    expect(()=>parseStudioAction({...action,action:'publish_material',code:'{}'})).toThrow('arguments');
  });
  it('labels design targets separately from high-detail render evidence', () => {
    const request = studioRequest({ brief: input.brief, history: 'Inspect candidate one', remainingCents: 835, images: [{ label: 'reference-front', image: 'data:image/jpeg;base64,AA==' }, { label: 'render-front', image: 'data:image/jpeg;base64,AA==' }] });
    expect(request.body.tools[0].name).toBe('blender_action');
    expect(request.body.reasoning.effort).toBe('high');
    expect(request.body.input[1].content).toEqual(expect.arrayContaining([{ type: 'input_text', text: 'reference-front' }, { type: 'input_text', text: 'render-front' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,AA==', detail: 'high' }]));
    expect(request.maxCostCents).toBeLessThanOrEqual(835);
  });
  it('rejects arbitrary URLs, duplicate labels and mismatched action arguments', () => {
    const request = { brief: input.brief, history: '', remainingCents: 835 };
    expect(() => studioRequest({ ...request, images: [{ label: 'reference-front', image: 'https://private.invalid/image' }] })).toThrow('image');
    const duplicate = { label: 'render-front', image: 'data:image/jpeg;base64,AA==' };
    expect(() => studioRequest({ ...request, images: [duplicate, duplicate] })).toThrow('image');
    const action = { action: 'inspect_scene', code: 'import os', objectName: '', views: [], summary: 'Inspect', critique: '' };
    expect(() => parseStudioAction(action)).toThrow('arguments');
    expect(() => parseStudioAction({ ...action, action: 'delete_account', code: '' })).toThrow('action');
    expect(() => parseStudioAction({ ...action, action: 'render_views', code: '' })).toThrow('arguments');
    expect(parseStudioAction({ ...action, code: '', injected: 'discard' })).not.toHaveProperty('injected');
    expect(parseStudioAction({ ...action, action: 'render_views', code: '', views: ['hero', 'right'] })).toMatchObject({ views: ['hero', 'right'] });
    expect(parseStudioAction({ ...action, action: 'edit', code: 'import bpy', views: ['front'] })).toMatchObject({ action: 'edit' });
    expect(() => parseStudioAction({ ...action, action: 'render_views', code: '', views: ['invalid'] })).toThrow('invalid Blender action');
  });
});
it('validates reusable component discovery and bounded assembly transforms',()=>{
 const action={action:'search_assets',code:JSON.stringify({q:'window',parentId:'bundle-'+'a'.repeat(64)}),objectName:'',views:[],summary:'Find a module',critique:''};
 expect(JSON.parse(parseStudioAction(action).code).q).toBe('window');
 const load={...action,action:'load_asset',code:JSON.stringify({id:'bundle-'+'a'.repeat(64),name:'Window A',location:[2,0,0]})};
 expect(JSON.parse(parseStudioAction(load).code)).toMatchObject({name:'Window A',scale:[1,1,1],rotation:[0,0,0]});
 for(const changes of [{id:'https://private.invalid/file'},{scale:[1,0,1]},{rotation:[0,1e20,0]},{name:''}]){
  expect(()=>parseStudioAction({...load,code:JSON.stringify({...JSON.parse(load.code),...changes})})).toThrow('component parameters');
 }
});

it('allows only named read-only resource inspections with no supplied code', () => {
  const action = { action: 'inspect_resources', code: '', objectName: 'advanced_kit', views: [], summary: 'Read toolkit help', critique: '' };
  expect(parseStudioAction(action)).toEqual(action);
  expect(() => parseStudioAction({ ...action, objectName: '/private/credentials' })).toThrow('resource');
  expect(() => parseStudioAction({ ...action, code: 'import bpy' })).toThrow('arguments');
});

it('exposes bounded Poly Haven reuse and keeps provider metadata untrusted',()=>{
 const action={action:'search_polyhaven',code:JSON.stringify({q:'soccer ball',cursor:'ball_01'}),objectName:'',views:[],summary:'Search Poly Haven',critique:''};
 expect(JSON.parse(parseStudioAction(action).code)).toEqual({q:'soccer ball',cursor:'ball_01'});
 const load={...action,action:'load_polyhaven',code:JSON.stringify({id:'dirty_football',name:'Soccer ball'})};
 expect(JSON.parse(parseStudioAction(load).code)).toEqual({id:'dirty_football',name:'Soccer ball',location:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
 for(const bad of [{id:'https://private.invalid/model'},{id:'../ball'},{id:'ball\n'},{scale:[0,1,1]}]){
  expect(()=>parseStudioAction({...load,code:JSON.stringify({...JSON.parse(load.code),...bad})})).toThrow();
 }
 expect(()=>parseStudioAction({...action,code:JSON.stringify({cursor:'../ball'})})).toThrow();
 const request=studioRequest({brief:'A sports diorama',history:'',remainingCents:835});
 const system=JSON.stringify(request.body.input[0]);
 expect(system).toContain('search_polyhaven');
 expect(system).toContain('load_polyhaven');
 expect(system).toContain('untrusted metadata');
 expect(system).toContain('continue modeling');
});
