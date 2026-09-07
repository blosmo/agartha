import {describe,expect,it} from 'vitest';
import type {MeshGeometry} from './mesh';
import {essentialForm} from './essentialForms';

function expectValidGeometry(mesh:MeshGeometry):void {
  const vertexCount=mesh.positions.length/3;
  expect(Number.isInteger(vertexCount)).toBe(true);
  expect(mesh.normals).toHaveLength(mesh.positions.length);
  expect(mesh.uvs).toHaveLength(vertexCount*2);
  expect(mesh.positions.every(Number.isFinite)).toBe(true);
  expect(mesh.normals.every(Number.isFinite)).toBe(true);
  expect(mesh.uvs?.every(value=>Number.isFinite(value)&&value>=0&&value<=1)).toBe(true);
  for(let index=0;index<mesh.normals.length;index+=3){
    expect(Math.hypot(mesh.normals[index],mesh.normals[index+1],mesh.normals[index+2])).toBeCloseTo(1,10);
  }
  for(let index=0;index<mesh.indices.length;index+=3){
    const ids=mesh.indices.slice(index,index+3);
    const points=ids.map(id=>mesh.positions.slice(id*3,id*3+3));
    const ab=points[1].map((value,axis)=>value-points[0][axis]);
    const ac=points[2].map((value,axis)=>value-points[0][axis]);
    const face=[
      ab[1]*ac[2]-ab[2]*ac[1],
      ab[2]*ac[0]-ab[0]*ac[2],
      ab[0]*ac[1]-ab[1]*ac[0],
    ];
    const normal=[0,1,2].map(axis=>ids.reduce((sum,id)=>sum+mesh.normals[id*3+axis],0));
    expect(face[0]*normal[0]+face[1]*normal[1]+face[2]*normal[2]).toBeGreaterThan(0);
  }
}

describe('roundedBox essential form',()=>{
  it('preserves dimensions with planar centers and rounded, outward geometry',()=>{
    const mesh=essentialForm({kind:'roundedBox',size:[4,2,3],radius:.2,segments:3});
    expect(mesh.bounds).toEqual([4,2,3]);
    expectValidGeometry(mesh);
    const faceCenter=mesh.positions.findIndex((value,index)=>
      index%3===0&&value===.5&&mesh.positions[index+1]===0&&mesh.positions[index+2]===0,
    );
    expect(faceCenter).toBeGreaterThanOrEqual(0);
    expect(mesh.normals.slice(faceCenter,faceCenter+3)).toEqual([1,0,0]);
  });

  it('is deterministic and rejects malformed or oversized recipes',()=>{
    const recipe={kind:'roundedBox',size:[4,2,3],radius:.2,segments:3};
    expect(essentialForm(recipe)).toEqual(essentialForm(recipe));
    expect(()=>essentialForm({kind:'roundedBox',size:[1,1,1],radius:1})).toThrow(/radius/i);
    expect(()=>essentialForm({kind:'roundedBox',size:[61,1,1],radius:.2})).toThrow(/size/i);
    expect(()=>essentialForm({kind:'roundedBox',size:[2,2,2],radius:.2,segments:9})).toThrow(/integer/i);
  });

  it('enforces the source-unit precision floor before building rounded geometry',()=>{
    expect(()=>essentialForm({kind:'roundedBox',size:[1,1,1],radius:1e-8})).toThrow('Rounded box radius must be at least 0.0001');
    expect(()=>essentialForm({kind:'roundedBox',size:[1,1,1],radius:.49999999})).toThrow('Rounded box inner half-extents must be at least 0.0001');
    expectValidGeometry(essentialForm({kind:'roundedBox',size:[1,1,1],radius:.0001,segments:1}));
    expectValidGeometry(essentialForm({kind:'roundedBox',size:[1,1,1],radius:.4999,segments:1}));
  });
});

describe('torus essential form',()=>{
  it('uses an XZ ring, Y-up tube, and matching wrapped seams',()=>{
    const segments=16,tubeSegments=8;
    const mesh=essentialForm({kind:'torus',radius:2,tube:.5,segments,tubeSegments});
    expect(mesh.bounds).toEqual([5,1,5]);
    expectValidGeometry(mesh);
    const stride=tubeSegments+1;
    for(let column=0;column<=tubeSegments;column++){
      const first=column*3,last=(segments*stride+column)*3;
      for(let axis=0;axis<3;axis++){
        expect(mesh.positions[last+axis]).toBeCloseTo(mesh.positions[first+axis],12);
        expect(mesh.normals[last+axis]).toBeCloseTo(mesh.normals[first+axis],12);
      }
    }
    expect(mesh.uvs?.slice(0,2)).toEqual([0,0]);
    expect(mesh.uvs?.slice(segments*stride*2,segments*stride*2+2)).toEqual([1,0]);
  });

  it('is deterministic and rejects invalid dimensions or excessive topology',()=>{
    const recipe={kind:'torus',radius:3,tube:1,segments:12,tubeSegments:6};
    expect(essentialForm(recipe)).toEqual(essentialForm(recipe));
    expect(()=>essentialForm({kind:'torus',radius:1,tube:1})).toThrow(/tube/i);
    expect(()=>essentialForm({kind:'torus',radius:2,tube:.5,segments:128,tubeSegments:128})).toThrow(/budget/i);
  });

  it('enforces the source-unit precision floor before building torus geometry',()=>{
    expect(()=>essentialForm({kind:'torus',radius:1,tube:1e-12})).toThrow('Torus tube must be at least 0.0001');
    expect(()=>essentialForm({kind:'torus',radius:1,tube:.99999999})).toThrow('Torus radius-minus-tube gap must be at least 0.0001');
    expectValidGeometry(essentialForm({kind:'torus',radius:1,tube:.0001,segments:8,tubeSegments:4}));
    expectValidGeometry(essentialForm({kind:'torus',radius:1,tube:.9999,segments:8,tubeSegments:4}));
  });
});

describe('sweep essential form',()=>{
  it('sweeps a capped circular section with distance-based UVs',()=>{
    const segments=8,steps=2;
    const mesh=essentialForm({kind:'sweep',path:[[0,0,0],[0,2,0],[0,4,0]],radius:1,segments,steps});
    expect(mesh.bounds).toEqual([2,4,2]);
    expectValidGeometry(mesh);
    const ringCount=5,stride=segments+1;
    expect(mesh.uvs?.[1]).toBe(0);
    expect(mesh.uvs?.[(ringCount-1)*stride*2+1]).toBe(1);
    expect(mesh.indices).toHaveLength(((ringCount-1)*segments*2+segments*2)*3);
  });

  it('transports frames around bends without section flips',()=>{
    const segments=8,steps=2;
    const mesh=essentialForm({kind:'sweep',path:[[0,0,0],[0,2,0],[2,2,0]],radius:.25,segments,steps,smooth:true});
    expectValidGeometry(mesh);
    const stride=segments+1;
    for(let ring=1;ring<5;ring++){
      const previous=(ring-1)*stride*3,current=ring*stride*3;
      const dot=[0,1,2].reduce((sum,axis)=>sum+mesh.normals[previous+axis]*mesh.normals[current+axis],0);
      expect(dot).toBeGreaterThan(-.1);
    }
  });

  it('is deterministic and rejects invalid paths, flags, reversals, and ring counts',()=>{
    const recipe={kind:'sweep',path:[[-1,0,0],[0,2,1],[2,3,1]],radius:.2,segments:7,steps:3,smooth:true};
    expect(essentialForm(recipe)).toEqual(essentialForm(recipe));
    expect(()=>essentialForm({kind:'sweep',path:[[0,0,0],[0,0,0]],radius:1})).toThrow(/duplicate/i);
    expect(()=>essentialForm({kind:'sweep',path:[[0,0,0],[1,0,0],[0,0,0]],radius:1})).toThrow(/reversal|tangent/i);
    expect(()=>essentialForm({kind:'sweep',path:[[0,0,0],[1,0,0]],radius:1,capStart:'yes'})).toThrow(/boolean/i);
    expect(()=>essentialForm({kind:'sweep',path:Array.from({length:128},(_,i)=>[i/5,0,0]),radius:.1,steps:8})).toThrow(/rings/i);
  });

  it('enforces source feature and sampled-ring precision before building sweep geometry',()=>{
    expect(()=>essentialForm({kind:'sweep',path:[[0,0,0],[0,1,0]],radius:1e-6})).toThrow('Sweep radius must be at least 0.0001');
    expect(()=>essentialForm({kind:'sweep',path:[[0,0,0],[1e-8,0,0]],radius:.1})).toThrow('Sweep path consecutive points must be at least 0.0001 apart');
    expect(()=>essentialForm({kind:'sweep',path:[[0,0,0],[.0002,0,0]],radius:.1,steps:3,smooth:true})).toThrow('Sweep sampled rings must be at least 0.0001 apart');
    expectValidGeometry(essentialForm({kind:'sweep',path:[[0,0,0],[0,1,0]],radius:.0001,segments:3}));
    expectValidGeometry(essentialForm({kind:'sweep',path:[[0,0,0],[.0001,0,0]],radius:.0001,segments:3}));
  });

  it('rejects closed paths before geometry creation and preserves the open-path precision boundary',()=>{
    const squareLoop=[[0,0,0],[2,0,0],[2,2,0],[0,2,0],[0,0,0]];
    expect(()=>essentialForm({kind:'sweep',path:squareLoop,radius:.1})).toThrow(
      'Sweep paths must be open: first and last points must be at least 0.0001 apart. Use a torus for circular loops or raw geometry for other closed paths.',
    );
    expect(()=>essentialForm({kind:'sweep',path:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,.00009999,0]],radius:.1})).toThrow(/must be open/);
    expectValidGeometry(essentialForm({kind:'sweep',path:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,.0001,0]],radius:.01,segments:8}));
  });
});

it('rejects unknown essential-form recipes',()=>{
  expect(()=>essentialForm({kind:'sphere'})).toThrow(/roundedBox, torus, or sweep/);
});
