import {expect,it} from 'vitest';
import {glbFixture as fixture} from './glbFixture';
import {GlbReader} from './glb';
import {inspectGlb} from './inspectGlb';

it('reads a GLB while retaining its material and animation structure',()=>{const bytes=fixture(),reader=new GlbReader(bytes),result=inspectGlb(bytes);expect(reader.accessor(0)).toEqual([0,0,0,1,0,0,0,1,0]);expect(result).toMatchObject({vertices:3,triangles:1,draws:1,materials:1,animations:[{name:'Float',duration:2,channels:1}]});});
it('rejects external resources and accessor overruns',()=>{expect(()=>inspectGlb(fixture(j=>j.buffers[0].uri='https://example.com/model.bin'))).toThrow('External');expect(()=>inspectGlb(fixture(j=>j.accessors[0].count=100))).toThrow('outside');});
it('rejects malformed containers, cycles and reverse-ordered deep hierarchies',()=>{const bytes=fixture();bytes[0]=0;expect(()=>inspectGlb(bytes)).toThrow('complete');expect(()=>inspectGlb(fixture(j=>j.nodes[0].children=[0]))).toThrow('cyclic');expect(()=>inspectGlb(fixture(j=>{j.nodes=Array.from({length:40},(_,i)=>i?{children:[i-1]}:{mesh:0});j.scenes[0].nodes=[39];}))).toThrow('deep');});
it('rejects mismatched animation outputs and unbudgeted instancing extensions',()=>{expect(()=>inspectGlb(fixture(j=>j.animations[0].channels[0].target.path='rotation'))).toThrow('output type');expect(()=>inspectGlb(fixture(j=>j.extensionsUsed=['EXT_mesh_gpu_instancing']))).toThrow('instancing');});
it('counts instanced geometry in the model rendering cost',()=>{const result=inspectGlb(fixture(j=>{j.nodes=[{mesh:0},{mesh:0}];j.scenes[0].nodes=[0,1];}));expect(result.triangles).toBe(2);expect(result.draws).toBe(2);});
it('rejects invalid inactive scenes and non-affine node matrices',()=>{expect(()=>inspectGlb(fixture(j=>j.scenes.push({nodes:[999]})))).toThrow('scene root');expect(()=>inspectGlb(fixture(j=>{delete j.animations;j.nodes[0].matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0];}))).toThrow('affine');});
it('reports the same fallback clip names as the native loader',()=>{expect(inspectGlb(fixture(j=>delete j.animations[0].name)).animations[0].name).toBe('animation_0');});
