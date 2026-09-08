import { afterEach, expect, it, vi } from 'vitest';
import catalog from '../../public/starter-assets/catalog.json';
import files from '../../public/starter-assets/model-files.json';
import { downloadModel } from './modelDownload';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('loads unknown assets from the canonical API',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});vi.stubGlobal('fetch',fetcher);
 await downloadModel(`model-${'a'.repeat(64)}`,new AbortController().signal);
 expect(fetcher).toHaveBeenCalledWith(`/api/models/model-${'a'.repeat(64)}/file`,expect.anything());
});
it('falls back when the static asset is missing or mismatched',async()=>{
 const id=catalog.models[0].modelId;
 const fetcher=vi.fn().mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});vi.stubGlobal('fetch',fetcher);
 expect((await downloadModel(id,new AbortController().signal)).byteLength).toBe(2);
 expect(fetcher.mock.calls[0][0]).toContain('/starter-assets/commons-scene.glb?v=');
 expect(fetcher.mock.calls[1][0]).toBe(`/api/models/${id}/file`);
});

it('keeps the compact download index aligned with the published starter catalog',()=>{expect(files).toEqual(Object.fromEntries(catalog.models.map(model=>[model.modelId,model.file])));});

it('verifies the bundled model hash and skips the canonical request',async()=>{
 const {readFileSync}=await import('node:fs');const {webcrypto}=await import('node:crypto');
 vi.stubGlobal('crypto',webcrypto);
 const model=catalog.models[0],bytes=readFileSync(new URL(`../../public/starter-assets/${model.file}`,import.meta.url));
 const fetcher=vi.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});vi.stubGlobal('fetch',fetcher);
 expect((await downloadModel(model.modelId,new AbortController().signal)).byteLength).toBe(model.bytes);
 expect(fetcher).toHaveBeenCalledTimes(1);
});
