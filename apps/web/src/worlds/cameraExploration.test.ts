import { afterEach, expect, it, vi } from 'vitest';
import { cameraExploration } from './cameraExploration';
afterEach(()=>vi.useRealTimers());
it('loads rooms during a continuous gesture, and cancels pending work on disposal',()=>{
 vi.useFakeTimers();const sample=vi.fn(),exploration=cameraExploration(sample);
 for(let i=0;i<20;i++){exploration.schedule();vi.advanceTimersByTime(30);}
 expect(sample).toHaveBeenCalledTimes(4);
 exploration.schedule();exploration.dispose();vi.advanceTimersByTime(150);
 expect(sample).toHaveBeenCalledTimes(4);
});
