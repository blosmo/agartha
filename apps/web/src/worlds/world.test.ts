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
  it('supports an environment-only mutation and reset with an independent version', () => {
    const original = createWorld();
    const lit = applyWorldEdit(original, { baseRevision: 0, author: 'Curator', message: 'Warm the courtyard', environment: { preset: 'golden-hour' }, expectedEnvironmentVersion: 0 });
    expect(lit.environment).toMatchObject({ preset: 'golden-hour', haze: 0.22, bloom: 0.12 });
    expect(lit.environmentVersion).toBe(1);
    expect(lit.objects).toEqual(original.objects);
    expect(() => applyWorldEdit(lit, { baseRevision: 1, author: 'Curator', message: 'Stale environment', environment: null, expectedEnvironmentVersion: 0 })).toThrow('changed');
    const reset = applyWorldEdit(lit, { baseRevision: 1, author: 'Curator', message: 'Reset atmosphere', environment: null, expectedEnvironmentVersion: 1 });
    expect(reset.environment).toBeUndefined();
    expect(reset.environmentVersion).toBe(2);
  });
  it('rejects mixed environment edits atomically', () => {
    const world = createWorld();
    expect(() => applyWorldEdit(world, { baseRevision: 0, author: 'Curator', message: 'Mixed', environment: { preset: 'moonlit' }, expectedEnvironmentVersion: 0, brief: 'No' })).toThrow('separately');
    expect(world.revision).toBe(0);
  });
  it('rejects environment writes to archived rooms', () => {
    const world = { ...createWorld(), archived: true };
    expect(() => applyWorldEdit(world, { baseRevision: 0, author: 'Curator', message: 'Change light', environment: { preset: 'moonlit' }, expectedEnvironmentVersion: 0 })).toThrow('archived');
  });
});


it('lets independently versioned atmosphere edits survive unrelated geometry changes', () => {
  const initial=createWorld();
  const moved=applyWorldEdit(initial,{baseRevision:initial.revision,author:'Builder',message:'Move pond',objects:[{...initial.objects[2],position:[5,0,5]}]});
  const lit=applyWorldEdit(moved,{baseRevision:initial.revision,expectedEnvironmentVersion:0,author:'Designer',message:'Warm light',environment:{preset:'golden-hour'}});
  expect(lit.environmentVersion).toBe(1);
  expect(lit.objects).toEqual(moved.objects);
  expect(()=>applyWorldEdit(lit,{baseRevision:lit.revision,expectedEnvironmentVersion:0,author:'Designer',message:'Stale light',environment:null})).toThrow('environment changed');
});
