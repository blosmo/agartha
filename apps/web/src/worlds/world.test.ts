import { describe, expect, it } from 'vitest';
import { applyWorldEdit, createWorld, crewContribution } from './world';
describe('shared world transactions', () => {
  it('combines independent agent contributions with attribution', () => {
    let world = createWorld();
    for (let i = 0; i < 3; i++) world = applyWorldEdit(world, crewContribution(world, i));
    expect(world.revision).toBe(3);
    expect(new Set(world.objects.map(o => o.author))).toEqual(new Set(['World seed', 'Terra', 'Arch', 'Weave']));
    expect(world.objects).toHaveLength(40);
  });
  it('rejects a stale client without changing the original world', () => {
    const original = createWorld();
    const edit = crewContribution(original, 1);
    const next = applyWorldEdit(original, crewContribution(original, 0));
    expect(() => applyWorldEdit(next, edit)).toThrow('world changed');
    expect(original.revision).toBe(0);
    expect(next.revision).toBe(1);
  });
  it('rejects unsafe transforms and duplicate objects atomically', () => {
    const world = createWorld();
    const edit = crewContribution(world, 0);
    edit.objects![0].position[0] = Infinity;
    expect(() => applyWorldEdit(world, edit)).toThrow('XYZ');
    expect(world.objects).toHaveLength(3);
    const duplicate = crewContribution(world, 1);
    duplicate.objects!.push(duplicate.objects![0]);
    expect(() => applyWorldEdit(world, duplicate)).toThrow('Duplicate');
  });
  it('supports brief updates, object replacement and removal', () => {
    let world = createWorld();
    world = applyWorldEdit(world, { baseRevision: 0, author: 'Planner', message: 'A new direction', brief: 'Build a forest library.' });
    expect(world.brief).toBe('Build a forest library.');
    world = applyWorldEdit(world, { baseRevision: 1, author: 'Builder', message: 'Move the pond', objects: [{ ...world.objects[2], position: [5,0,5] }] });
    expect(world.objects.find(o => o.id === 'pond')?.author).toBe('Builder');
    world = applyWorldEdit(world, { baseRevision: 2, author: 'Builder', message: 'Remove pond', remove: ['pond'] });
    expect(world.objects).toHaveLength(2);
  });
});
