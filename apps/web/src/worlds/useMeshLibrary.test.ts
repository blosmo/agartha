import {renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useMeshLibrary} from './useMeshLibrary';
afterEach(()=>vi.unstubAllGlobals());
it('deduplicates immutable mesh requests and preserves valid meshes when another load fails',async()=>{
 const good=`mesh-${'1'.repeat(64)}`,bad=`mesh-${'2'.repeat(64)}`;
 const fetchMock=vi.fn(async(path:string)=>({ok:path.endsWith(good),status:path.endsWith(good)?200:404,json:async()=>({id:good,kind:'mesh',geometry:{positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2]}})}));
 vi.stubGlobal('fetch',fetchMock);
 const {result,rerender}=renderHook(({ids})=>useMeshLibrary(ids),{initialProps:{ids:[good,good,bad]}});
 await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(result.current.geometry.has(good)).toBe(true);expect(result.current.error).toBeTruthy();expect(fetchMock).toHaveBeenCalledTimes(2);
 rerender({ids:[good]});await waitFor(()=>expect(result.current.error).toBe(''));expect(fetchMock).toHaveBeenCalledTimes(2);
});
