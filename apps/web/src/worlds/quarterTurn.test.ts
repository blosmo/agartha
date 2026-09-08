import { expect, it } from 'vitest';
import { QuarterTurn, TURN_DURATION_MS, turnEase } from './quarterTurn';
it('moves monotonically to exactly one quarter turn in 250ms',()=>{
 const turn=new QuarterTurn();turn.rotate(0,false);
 expect(turn.sample(0)).toBe(0);let last=0;
 for(let ms=10;ms<=TURN_DURATION_MS;ms+=10){const angle=turn.sample(ms);expect(angle).toBeGreaterThanOrEqual(last);last=angle;}
 expect(turn.value).toBe(Math.PI/2);expect(turn.active).toBe(false);
 expect(turnEase(.5)).toBeGreaterThan(.45);expect(turnEase(.5)).toBeLessThan(.6);
});
it('retargets repeated taps from the current pose and counts every click',()=>{
 const turn=new QuarterTurn();turn.rotate(0,false);const displayed=turn.sample(100);
 turn.rotate(100,false);expect(turn.sample(100)).toBe(displayed);
 expect(turn.sample(350)).toBe(Math.PI);
 turn.rotate(400,false);turn.rotate(400,false);expect(turn.sample(650)).toBe(Math.PI*2);
});
it('snaps reduced-motion and keyboard activations, and can finish or reset mid-flight',()=>{
 const turn=new QuarterTurn();turn.rotate(0,true);expect(turn.value).toBe(Math.PI/2);expect(turn.active).toBe(false);
 turn.rotate(100,false);turn.sample(150);turn.finish();expect(turn.value).toBe(Math.PI);
 turn.reset();expect(turn.sample(500)).toBe(0);expect(turn.active).toBe(false);
});
