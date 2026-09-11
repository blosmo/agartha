import { describe, expect, it, vi } from 'vitest';
import type { LedgerCall } from '../packages/billing/ledgerClient';
import { pollMeshy, startMeshy, validateMeshyAssetUrl } from '../packages/modeling/meshy';

const base = { jobId: 'job', executorId: 'executor', operationId: 'mesh-1', rate: { usdCents: 2000, credits: 1000 } };
const image = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 0]).toString('base64')}`;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Meshy provider transport', () => {
  it('uses textured Meshy 7 PBR GLB settings and quotes 30 credits', async () => {
    const ledger = vi.fn(async (name: string) => name === 'claimManagedInference' ? { claimed: true } : {});
    const fetcher = vi.fn().mockResolvedValue(response({ result: 'task-1' }));
    const result = await startMeshy({ ...base, stage: 'image-to-3d', image }, ledger as LedgerCall, 'secret', fetcher);
    expect(result).toMatchObject({ taskId: 'task-1', status: 'pending' });
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toMatchObject({ ai_model: 'meshy-7', enable_pbr: true, should_texture: true, texture_resolution: '2k', should_remesh: true, target_polycount: 20000, target_formats: ['glb'] });
    expect(ledger).toHaveBeenCalledWith('claimManagedInference', expect.objectContaining({ kind: 'meshy', maxCostCents: 60 }));
    expect(ledger).toHaveBeenCalledWith('attachManagedMeshyTask', expect.objectContaining({ taskId: 'task-1' }));
  });

  it('allows a realistic large reference image while keeping the response bound', async () => {
    const ledger = vi.fn(async (name: string) => name === 'claimManagedInference' ? { claimed: true } : {});
    const largeImage = `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(240_000, 7)]).toString('base64')}`;
    const fetcher = vi.fn().mockResolvedValue(response({ result: 'task-large' }));
    await expect(startMeshy({ ...base, stage: 'image-to-3d', image: largeImage }, ledger as LedgerCall, 'secret', fetcher)).resolves.toMatchObject({ taskId: 'task-large' });
    expect(ledger).toHaveBeenCalledWith('claimManagedInference', expect.anything());
  });

  it('replays an attached operation without a second paid POST', async () => {
    const ledger = vi.fn(async (name: string) => name === 'getManagedMeshyOperation' ? { meshTaskId: 'task-1', status: 'pending' } : { claimed: false });
    const fetcher = vi.fn();
    await expect(startMeshy({ ...base, stage: 'image-to-3d', image }, ledger as LedgerCall, 'secret', fetcher)).resolves.toMatchObject({ taskId: 'task-1' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('polls success, validates the trusted GLB and settles exact usage', async () => {
    const ledger = vi.fn(async (name: string) => name === 'getManagedMeshyOperation' ? { meshTaskId: 'task-1', meshStage: 'image-to-3d', maxCostCents: 60 } : {});
    const fetcher = vi.fn().mockResolvedValue(response({ id: 'task-1', status: 'SUCCEEDED', consumed_credits: 30, model_urls: { glb: 'https://assets.meshy.ai/models/a.glb' } }));
    const result = await pollMeshy(base, ledger as LedgerCall, 'secret', fetcher);
    expect(result).toMatchObject({ status: 'succeeded', chargeCents: 60, result: { modelUrl: 'https://assets.meshy.ai/models/a.glb' } });
    expect(ledger).toHaveBeenCalledWith('completeManagedMeshyTask', expect.objectContaining({ chargeCents: 60, result: { status: 'succeeded', modelUrl: 'https://assets.meshy.ai/models/a.glb' } }));
  });

  it('refreshes an unretained settled result without charging or dispatching again', async () => {
    const ledger = vi.fn(async (name: string) => name === 'getManagedMeshyOperation' ? { meshTaskId: 'task-1', meshStage: 'image-to-3d', meshResult: { status: 'succeeded', modelUrl: 'https://assets.meshy.ai/expired.glb' }, meshArtifactReady: false, chargeCents: 60 } : {});
    const fetcher = vi.fn().mockResolvedValue(response({ id: 'task-1', status: 'SUCCEEDED', consumed_credits: 30, model_urls: { glb: 'https://assets.meshy.ai/fresh.glb' } }));
    await expect(pollMeshy({ ...base, refreshResult: true }, ledger as LedgerCall, 'secret', fetcher)).resolves.toMatchObject({ status: 'succeeded', chargeCents: 60, result: { modelUrl: 'https://assets.meshy.ai/fresh.glb' } });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/image-to-3d/task-1'), expect.objectContaining({ method: 'GET' }));
    expect(ledger).not.toHaveBeenCalledWith('completeManagedMeshyTask', expect.anything());
    expect(ledger).not.toHaveBeenCalledWith('completeManagedInference', expect.anything());
  });

  it('refunds a failed task even when the provider reports credits', async () => {
    const ledger = vi.fn(async (name: string) => name === 'getManagedMeshyOperation' ? { meshTaskId: 'task-1', meshStage: 'image-to-3d', maxCostCents: 60 } : {});
    const fetcher = vi.fn().mockResolvedValue(response({ id: 'task-1', status: 'FAILED', consumed_credits: 30 }));
    await expect(pollMeshy(base, ledger as LedgerCall, 'secret', fetcher)).resolves.toMatchObject({ status: 'failed', chargeCents: 0 });
    expect(ledger).toHaveBeenCalledWith('completeManagedMeshyTask', expect.objectContaining({ chargeCents: 0 }));
  });

  it('fails closed on mismatched task IDs and unknown statuses', async () => {
    const operation = { meshTaskId: 'task-1', meshStage: 'image-to-3d' as const };
    const ledger = vi.fn(async (name: string) => name === 'getManagedMeshyOperation' ? operation : {});
    await expect(pollMeshy(base, ledger as LedgerCall, 'secret', vi.fn().mockResolvedValue(response({ id: 'task-2', status: 'IN_PROGRESS' })))).rejects.toThrow('mismatched');
    await expect(pollMeshy(base, ledger as LedgerCall, 'secret', vi.fn().mockResolvedValue(response({ id: 'task-1', status: 'MYSTERY' })))).rejects.toThrow('unknown');
  });

  it('rejects a changed payload for a known operation ID', async () => {
    const ledger = vi.fn(async (name: string, args: Record<string, unknown>) => name === 'getManagedMeshyOperation' ? { meshStage: 'image-to-3d' as const, payloadFingerprint: 'different' } : { claimed: true });
    await expect(startMeshy({ ...base, stage: 'image-to-3d', image }, ledger as LedgerCall, 'secret', vi.fn())).rejects.toThrow('does not match');
  });

  it('rejects untrusted asset URLs and overrun credits', async () => {
    expect(() => validateMeshyAssetUrl('https://evil.example/model.glb')).toThrow('untrusted');
    expect(() => validateMeshyAssetUrl('https://assets.meshy.ai:444/model.glb')).toThrow();
    const ledger = vi.fn(async (name: string) => name === 'getManagedMeshyOperation' ? { meshTaskId: 'task-1', meshStage: 'image-to-3d' } : {});
    const fetcher = vi.fn().mockResolvedValue(response({ id: 'task-1', status: 'SUCCEEDED', consumed_credits: 31, model_urls: { glb: 'https://assets.meshy.ai/models/a.glb' } }));
    await expect(pollMeshy(base, ledger as LedgerCall, 'secret', fetcher)).rejects.toThrow('exceeded');
  });

  it('requires an owned successful parent for rigging', async () => {
    const ledger = vi.fn(async (name: string) => name === 'getManagedMeshyOperation' ? null : { claimed: true });
    await expect(startMeshy({ ...base, operationId: 'rig-1', stage: 'rigging', parentOperationId: 'mesh-1', heightMeters: 1.7 }, ledger as LedgerCall, 'secret', vi.fn())).rejects.toThrow('parent');
  });
});
