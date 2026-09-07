import {describe,it,expect} from 'vitest';
import {roomShell} from './roomShell';
describe('shared room architecture',()=>{
  it('joins neighboring floors without gaps and keeps all four doorways passable',()=>{
    const parts=roomShell(4,-1);
    expect(parts.find(p=>p.id==='floor')?.scale).toEqual([32,1,32]);
    for(const [x,z] of [[16,0],[-16,0],[0,16],[0,-16]]){
      const blockers=parts.filter(p=>Math.abs(p.position[0]-x)<p.scale[0]/2+.01&&Math.abs(p.position[2]-z)<p.scale[2]/2+.01&&p.position[1]+p.scale[1]/2>.1&&p.position[1]-p.scale[1]/2<3);
      expect(blockers).toEqual([]);
    }
    expect(new Set(parts.map(p=>p.id)).size).toBe(parts.length);
    expect(parts.every(p=>p.scale.every(n=>n>=.1&&n<=60))).toBe(true);
  });
  it('keeps default boundaries below furniture sightlines',()=>{
    expect(roomShell(1,1).every(part=>part.position[1]+part.scale[1]/2<=1.2)).toBe(true);
  });
  it('keeps open cells visibly empty and chooses stable colors at negative addresses',()=>{
    expect(roomShell(-4,-8)).toEqual(roomShell(-4,-8));
    expect(roomShell(-4,-8).every(p=>/^#[a-f0-9]{6}$/.test(p.color))).toBe(true);
    expect(roomShell(0,0,true).some(p=>p.id.includes('wall'))).toBe(false);
  });
});
it('keeps doorway and corner pieces disjoint and inside their owning room',()=>{
 const structure=roomShell(1,1).filter(part=>!part.id.startsWith('tile-')&&part.id!=='floor');
 for(const part of structure)for(const axis of [0,2]){
  expect(part.position[axis]-part.scale[axis]/2,part.id).toBeGreaterThanOrEqual(-16-1e-8);
  expect(part.position[axis]+part.scale[axis]/2,part.id).toBeLessThanOrEqual(16+1e-8);
 }
 for(let i=0;i<structure.length;i++)for(let j=i+1;j<structure.length;j++){
  const a=structure[i],b=structure[j];
  const overlap=[0,1,2].every(axis=>Math.min(a.position[axis]+a.scale[axis]/2,b.position[axis]+b.scale[axis]/2)-Math.max(a.position[axis]-a.scale[axis]/2,b.position[axis]-b.scale[axis]/2)>1e-8);
  expect(overlap,`${a.id} overlaps ${b.id}`).toBe(false);
 }
});
