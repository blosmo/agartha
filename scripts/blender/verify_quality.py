"""Real-Blender export regression and repeatable preview measurements.

blender -b --factory-startup --python scripts/blender/verify_quality.py -- \
  --kit scripts/seed/starter_kit.py --output /tmp/blender-quality --assert-quality
Run without --assert-quality against an earlier kit to record a baseline.
No network, credentials, paid workers or external Python packages are used.
"""
import gc
import faulthandler
import argparse
import json
from pathlib import Path
import struct
import sys
from types import SimpleNamespace

import bpy

# Keep a native exporter hang diagnosable in CI instead of losing the job timeout.
faulthandler.dump_traceback_later(90, repeat=True)


def fixture(kit):
    # Rebuild fixture data without reloading Blender while addon caches are live.
    # Full factory reloads invalidate native references retained by the importer.
    kit['reset_scene']('Quality benchmark')
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'
    scene.render.filepath='/tmp/original-render-path'
    scene.render.image_settings.media_type='VIDEO'
    scene.render.image_settings.file_format='FFMPEG'
    scene.render.resolution_x=777
    scene.cycles.samples=23
    scene.cycles.use_adaptive_sampling=False
    clay=kit['material']('Ceramic','#AC563F',roughness=.35)
    stone=kit['material']('Stone','#D4C7AF',roughness=.75)
    metal=kit['material']('Brass','#B89B55',metallic=.75,roughness=.25)
    image=bpy.data.images.new('Checker',width=16,height=16)
    image.pixels=[channel for y in range(16) for x in range(16)
                  for channel in ((.08,.18,.3,1) if (x//2+y//2)%2 else (.85,.75,.5,1))]
    image.pack()
    texture=clay.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image=image
    texture.interpolation='Closest'
    clay.node_tree.links.new(texture.outputs['Color'],clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    sphere=kit['sphere']('hero_sphere',(-.6,.85,0),(.65,.85,.65),clay,segments=32,rings=16)
    for polygon in sphere.data.polygons:
        polygon.use_smooth=True
    mirror=sphere.copy()
    mirror.data=sphere.data.copy()
    mirror.data.uv_layers.active.name='DifferentUVLayout'
    mirror.location.x=1.2
    mirror.scale.x*=-1
    bpy.context.collection.objects.link(mirror)
    joined_mirror=sphere.copy()
    joined_mirror.data=sphere.data.copy()
    joined_mirror.location.x=.1
    joined_mirror.location.y=1
    joined_mirror.scale.x*=-.6
    joined_mirror.scale.y*=.6
    joined_mirror.scale.z*=.6
    bpy.context.collection.objects.link(joined_mirror)
    scaled=sphere.copy()
    scaled.data=sphere.data.copy()
    scaled.location.x=-1.4
    scaled.location.y=1
    scaled.scale.x*=.4
    scaled.scale.y*=.9
    scaled.scale.z*=.5
    bpy.context.collection.objects.link(scaled)
    kit['cube']('hero_plinth',(0,.05,0),(4,.1,3),stone,bevel=.025)
    brass=kit['cube']('hero_brass',(.45,.4,1),(.45,.65,.45),clay,bevel=.06)
    brass.material_slots[0].link='OBJECT'
    brass.material_slots[0].material=metal
    kit['curve']('hero_handle',[(.4,.9,1),(.7,1.1,1),(.9,.9,1)],.05,metal)
    bpy.ops.mesh.primitive_plane_add(size=.5,location=(-1,-1,.2))
    plane=bpy.context.object
    plane.name='hero_flattened_plane'
    plane.scale.z=0
    plane.data.materials.append(stone)
    scene.world.color=(.14,.2,.25)
    bpy.context.view_layer.update()
    return kit['_objects']()


def snapshot():
    scene=bpy.context.scene
    return {'objects':sorted(o.name for o in scene.objects),
            'geometry':[(o.name,o.hide_render,tuple(v for row in o.matrix_world for v in row),
                         tuple(tuple(v.co) for v in o.data.vertices) if o.type=='MESH' else (),
                         tuple((uv.name,tuple(tuple(loop.uv) for loop in uv.data)) for uv in o.data.uv_layers) if o.type=='MESH' else ()) for o in scene.objects],
            'blocks':{name:len(getattr(bpy.data,name)) for name in ('objects','meshes','cameras','lights','worlds')},
            'world':scene.world.name if scene.world else None,
            'worldColor':list(scene.world.color) if scene.world else None,
            'render':{key:getattr(scene.render,key) for key in ('engine','filepath','resolution_x','resolution_y','resolution_percentage','threads','threads_mode','film_transparent')},
            'format':scene.render.image_settings.file_format,
            'mediaType':scene.render.image_settings.media_type,
            'cycles':{key:getattr(scene.cycles,key) for key in ('samples','use_denoising','denoiser','device','use_adaptive_sampling','adaptive_threshold','adaptive_min_samples','time_limit')},
            'selected':sorted(o.name for o in bpy.context.selected_objects),
            'active':bpy.context.view_layer.objects.active.name if bpy.context.view_layer.objects.active else None}


def verify_failure_cleanup(kit,output):
    fixture(kit)
    before=snapshot()
    def failed(**kwargs):
        raise RuntimeError('Expected regression-test failure')
    for function,ops in (
        ('render_preview',SimpleNamespace(render=SimpleNamespace(render=failed))),
        ('export_runtime',SimpleNamespace(object=bpy.ops.object,export_scene=SimpleNamespace(gltf=failed))),
    ):
        kit['bpy']=SimpleNamespace(context=bpy.context,data=bpy.data,ops=ops)
        try:
            try:
                kit[function](str(output/'expected-failure'))
            except RuntimeError as error:
                assert str(error)=='Expected regression-test failure'
            else:
                raise AssertionError('Expected a forced operation failure')
        finally:
            kit['bpy']=bpy
        assert before==snapshot(), function+' failed to restore the source after an exception'


def verify_nested_texture(kit):
    material=kit['material']('Nested texture guard','#FFFFFF')
    group=bpy.data.node_groups.new('Nested texture','ShaderNodeTree')
    inner=bpy.data.node_groups.new('Inner texture','ShaderNodeTree')
    try:
        material.node_tree.nodes.new('ShaderNodeGroup').node_tree=group
        group.nodes.new('ShaderNodeGroup').node_tree=inner
        inner.nodes.new('ShaderNodeTexImage')
        assert kit['_has_texture'](material), 'Nested texture inputs must retain UVs'
    finally:
        bpy.data.materials.remove(material)
        bpy.data.node_groups.remove(group)
        bpy.data.node_groups.remove(inner)


def surface_normals(objects):
    result={}
    deps=bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        if obj.type not in {'MESH','CURVE'}:
            continue
        evaluated=obj.evaluated_get(deps)
        # Inspect an owned snapshot without clearing the evaluated object’s mesh.
        mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps)
        try:
            matrix=evaluated.matrix_world
            try:
                normal_matrix=matrix.to_3x3().inverted().transposed()
            except ValueError:
                normal_matrix=None
            flat_normals={}
            if normal_matrix is None:
                for polygon in mesh.polygons:
                    points=[matrix @ mesh.vertices[index].co for index in polygon.vertices]
                    normal=(points[1]-points[0]).cross(points[2]-points[0]).normalized()
                    flat_normals.update((index,normal) for index in polygon.loop_indices)
            for index,(loop,normal) in enumerate(zip(mesh.loops,mesh.corner_normals)):
                point=matrix @ mesh.vertices[loop.vertex_index].co
                key=tuple(round(value,4) for value in point)
                direction=(normal_matrix @ normal.vector).normalized() if normal_matrix is not None else flat_normals[index]
                result.setdefault(key,[]).append(direction)
        finally:
            bpy.data.meshes.remove(mesh)
    return result


def glb_document(path):
    data=Path(path).read_bytes()
    return json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])


def surface_inputs(objects):
    uvs,materials={},{}
    deps=bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        if obj.type not in {'MESH','CURVE'}:continue
        evaluated=obj.evaluated_get(deps)
        # Inspect an owned snapshot without clearing the evaluated object’s mesh.
        mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps)
        try:
            uv=next((layer for layer in mesh.uv_layers if layer.active_render),None)
            for polygon in mesh.polygons:
                material=evaluated.material_slots[polygon.material_index].material
                name=material.name.split('.')[0] if material else ''
                for index in polygon.loop_indices:
                    point=evaluated.matrix_world @ mesh.vertices[mesh.loops[index].vertex_index].co
                    key=tuple(round(value,4) for value in point)
                    materials.setdefault(key,set()).add(name)
                    if uv is not None and name=='Ceramic':
                        uvs.setdefault(key,[]).append(tuple(uv.data[index].uv))
        finally:
            bpy.data.meshes.remove(mesh)
    return uvs,materials


def measure_export(kit,output):
    original=fixture(kit)
    normals=surface_normals(original)
    original_uvs,original_materials=surface_inputs(original)
    before=snapshot()
    exported=kit['export_runtime'](str(output/'model.glb'))
    unchanged=before==snapshot()
    doc=glb_document(output/'model.glb')
    primitives=[p for mesh in doc['meshes'] for p in mesh['primitives']]
    textured=[p for p in primitives if 'baseColorTexture' in doc['materials'][p['material']].get('pbrMetallicRoughness',{})]
    previous=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(output/'model.glb'))
    imported_objects=set(bpy.data.objects)-previous
    imported=surface_normals(imported_objects)
    imported_uvs,imported_materials=surface_inputs(imported_objects)
    agreements=[]
    mismatches=[]
    for position,values in imported.items():
        matches=normals.get(position)
        if matches:
            scores=[max(normal.dot(expected) for expected in matches) for normal in values]
            agreements.extend(scores)
            if min(scores)<.9999 and len(mismatches)<10:
                mismatches.append({'position':position,'minimumDot':min(scores)})
    return {**exported,'sourceUnchanged':unchanged,'embeddedImages':len(doc.get('images',[])),
            'uvPreserved':bool(textured) and all('TEXCOORD_0' in p['attributes'] for p in textured),
            'uvValuesPreserved':bool(imported_uvs) and all(
                key in original_uvs and all(any(sum((a-b)**2 for a,b in zip(uv,expected))<1e-8 for expected in original_uvs[key]) for uv in values)
                for key,values in imported_uvs.items()),
            'materialsPreserved':all(values<=original_materials.get(key,set()) for key,values in imported_materials.items()),
            'normalMatchFraction':sum(value>.9999 for value in agreements)/max(1,len(agreements)),
            'normalMismatchExamples':mismatches,
            'matchedPositionFraction':sum(position in normals for position in imported)/max(1,len(imported)),
            'runtimeVertices':sum(doc['accessors'][p['attributes']['POSITION']]['count'] for p in primitives)}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--kit',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--assert-quality',action='store_true')
    parser.add_argument('--renders',action='store_true')
    parser.add_argument('--repeats',type=int,default=1,choices=range(1,6))
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    output=args.output.resolve()
    output.mkdir(parents=True,exist_ok=True)
    kit={}
    exec(compile(args.kit.read_text(),str(args.kit),'exec'),kit)
    metrics={'blender':bpy.app.version_string,'platform':sys.platform,'export':measure_export(kit,output),'renders':[]}
    # Record every measurement immediately; interrupted runs retain completed work.
    def save():
        (output/'metrics.json').write_text(json.dumps(metrics,indent=2))
    save()
    if args.renders:
        cases=[('baseline',512,8)] if not args.assert_quality else [('draft',256,None),('review',512,None),('final',512,128)]
        for quality,size,samples in cases:
            for attempt in range(args.repeats):
                fixture(kit)
                before=snapshot()
                kwargs={'size':size}
                if samples is not None:kwargs['samples']=samples
                if args.assert_quality:kwargs['quality']=quality
                name=quality if attempt==0 else f'{quality}-{attempt+1}'
                rendered=kit['render_preview'](str(output/(name+'.png')),**kwargs)
                rendered.update(sourceUnchanged=before==snapshot(),quality=quality,attempt=attempt+1)
                metrics['renders'].append(rendered)
                save()
    if args.assert_quality:
        assert metrics['export']['sourceUnchanged'], 'Export mutated the source'
        assert metrics['export']['uvPreserved'], 'Export lost UV attributes'
        assert metrics['export']['uvValuesPreserved'], 'Export changed UV mapping'
        assert metrics['export']['materialsPreserved'], 'Export changed material assignments'
        assert metrics['export']['embeddedImages']==1, 'Texture must be embedded once'
        assert metrics['export']['normalMatchFraction']==1, 'Export changed surface shading'
        assert metrics['export']['matchedPositionFraction']==1, 'Export changed geometry positions'
        assert all(item['sourceUnchanged'] for item in metrics['renders']), 'Preview mutated the source'
        verify_failure_cleanup(kit,output)
        verify_nested_texture(kit)
        metrics['failureCleanupPassed']=True
        save()
    print('QUALITY_RESULT '+json.dumps(metrics))
    # Exec-created functions retain their namespace, including native mathutils wrappers.
    # Release that cycle while Blender is alive rather than during Python finalization.
    kit.clear()
    gc.collect()
    faulthandler.cancel_dump_traceback_later()


if __name__=='__main__':
    main()
