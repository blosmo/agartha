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
    expect(request.body.tools[0].function.name).toBe('blender_action');
    expect(request.body.reasoning_effort).toBe('high');
    expect(request.body.messages[1].content).toEqual(expect.arrayContaining([{ type: 'text', text: 'reference-front' }, { type: 'text', text: 'render-front' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA==', detail: 'high' } }]));
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
