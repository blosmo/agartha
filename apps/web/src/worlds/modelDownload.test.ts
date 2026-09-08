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
 const model=catalog.models[0],bytes=new ArrayBuffer(4);
 const digest=vi.fn().mockResolvedValue(Uint8Array.from(model.modelId.slice(6).match(/../g)!,value=>parseInt(value,16)).buffer);
 vi.stubGlobal('crypto',{subtle:{digest}});
 const fetcher=vi.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>bytes});vi.stubGlobal('fetch',fetcher);
 expect(await downloadModel(model.modelId,new AbortController().signal)).toBe(bytes);
 expect(digest).toHaveBeenCalledWith('SHA-256',bytes);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects a stale static copy when its content hash differs',async()=>{
 vi.stubGlobal('crypto',{subtle:{digest:vi.fn().mockResolvedValue(new Uint8Array(32).buffer)}});
 const fetcher=vi.fn().mockResolvedValueOnce({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}).mockResolvedValueOnce({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});vi.stubGlobal('fetch',fetcher);
 expect((await downloadModel(catalog.models[0].modelId,new AbortController().signal)).byteLength).toBe(2);
 expect(fetcher).toHaveBeenCalledTimes(2);
});
