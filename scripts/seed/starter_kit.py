"""Exec-composable Blender 4.5 starter authoring toolkit.

All public positions, sizes, vertices and Euler rotations use world (X,Y,Z),
Y up. Blender mapping is (X,-Z,Y). Name reusable parts with a shared prefix.

reset_scene(name); material(name,color,roughness=.8,metallic=0)
cube(name,loc,size,mat,bevel=0)
cylinder(name,loc,radius,depth,mat,vertices=12,rotation=None)
beam(name,start,end,width,mat,depth=None,bevel=0)
curve(name,points,radius,mat,resolution=1)
mesh(name,vertices,faces,mat)
sphere(name,loc,scale,mat,segments=12,rings=6)
tree(name,loc,height,mat_trunk,mat_leaf,radius=None)
finish_scene(); save_source(path,collection=None,prefix=None)
export_runtime(path,collection=None,prefix=None)
render_preview(path,size=None,samples=None,collection=None,prefix=None,quality="review",view="isometric")

Export functions return JSON-serializable geometry/bounds/cost metadata.
Call save_source before export_runtime; export operates on disposable copies.
Component saves contain an independently usable Scene. Embedded PBR textures and
smooth normals survive static runtime export. No texture download is required.
"""
import bpy
import math
import os
import time
import json
import struct
from mathutils import Vector, Matrix, Euler

_KIT_MAP = Matrix(((1,0,0),(0,0,-1),(0,1,0)))

def _v(p):
    return Vector((p[0], -p[2], p[1]))

def _world(p):
    return [float(p.x), float(p.z), float(-p.y)]

def reset_scene(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for blocks in (bpy.data.meshes,bpy.data.curves,bpy.data.materials,bpy.data.cameras,bpy.data.lights):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)
    bpy.context.scene.name = name
    bpy.context.scene.render.threads_mode = 'FIXED'
    bpy.context.scene.render.threads = 2
    return bpy.context.scene

def material(name, color, roughness=.8, metallic=0):
    if isinstance(color,str):
        value=color.lstrip('#')
        if len(value) not in (6,8):
            raise ValueError('Hex colors require RRGGBB or RRGGBBAA')
        channels=[int(value[i:i+2],16)/255 for i in range(0,len(value),2)]
        color=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in channels[:3]] + channels[3:]
    m = bpy.data.materials.new(name)
    m.diffuse_color = tuple(color[:3]) + (color[3] if len(color)>3 else 1,)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = m.diffuse_color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return m

def _finish(obj,name,mat,bevel=0):
    obj.name = name
    if mat is not None:
        obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Hand softened edges','BEVEL')
        mod.width = bevel
        mod.segments = 1
    return obj

def cube(name,loc,size,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=_v(loc))
    o = bpy.context.object
    o.dimensions = (size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o,name,mat,bevel)

def cylinder(name,loc,radius,depth,mat,vertices=12,rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=_v(loc))
    o = bpy.context.object
    if rotation is not None:
        o.rotation_euler = (_KIT_MAP @ Euler(rotation).to_matrix() @ _KIT_MAP.inverted()).to_euler()
    return _finish(o,name,mat)

def beam(name,start,end,width,mat,depth=None,bevel=0):
    a,b = _v(start),_v(end)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(a+b)*.5)
    o=bpy.context.object
    o.dimensions=(width,depth if depth is not None else width,(b-a).length)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return _finish(o,name,mat,bevel)

def curve(name,points,radius,mat,resolution=1):
    data=bpy.data.curves.new(name,'CURVE')
    data.dimensions='3D'
    data.resolution_u=resolution
    data.bevel_depth=radius
    data.bevel_resolution=0
    data.resolution_u=1
    data.use_fill_caps=True
    spline=data.splines.new('POLY')
    spline.points.add(len(points)-1)
    for target,p in zip(spline.points,points):
        target.co=(*_v(p),1)
    o=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(o)
    return _finish(o,name,mat)

def mesh(name,vertices,faces,mat):
    data=bpy.data.meshes.new(name)
    data.from_pydata([_v(p) for p in vertices],[],faces)
    data.update()
    o=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(o)
    return _finish(o,name,mat)

def sphere(name,loc,scale,mat,segments=12,rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=_v(loc))
    o=bpy.context.object
    o.scale=(scale[0],scale[2],scale[1])
    return _finish(o,name,mat)

def tree(name,loc,height,mat_trunk,mat_leaf,radius=None):
    x,y,z=loc
    r=radius if radius is not None else height*.27
    trunk=beam(name+'_trunk',(x,y,z),(x+.25,y+height*.7,z-.15),height*.075,mat_trunk)
    for i,(dx,dz,f) in enumerate(((-.45,0,.72),(.4,.18,.76),(0,-.3,.94))):
        sphere(name+'_canopy_'+str(i),(x+dx*r,y+height*f,z+dz*r),(r,r*.75,r*.85),mat_leaf)
    return trunk

def _objects(collection=None,prefix=None):
    if collection is not None:
        col=bpy.data.collections.get(collection) if isinstance(collection,str) else collection
        if col is None:
            raise ValueError('Missing component collection')
        candidates=list(col.all_objects)
    else:
        candidates=list(bpy.context.scene.objects)
    result=[o for o in candidates if o.type in {'MESH','CURVE','SURFACE','FONT'} and not o.hide_render and not o.get('exclude_runtime',False) and (prefix is None or o.name.startswith(prefix))]
    if not result:
        raise ValueError('No exportable geometry matches selection')
    return result

def _metadata(objects):
    deps=bpy.context.evaluated_depsgraph_get()
    points=[]
    triangles=0
    materials=set()
    for o in objects:
        evaluated=o.evaluated_get(deps)
        data=evaluated.to_mesh()
        try:
            data.calc_loop_triangles()
            triangles+=len(data.loop_triangles)
            points.extend([_world(evaluated.matrix_world @ v.co) for v in data.vertices])
            materials.update(m.name for m in data.materials if m is not None)
        finally:
            evaluated.to_mesh_clear()
    return {'objects':len(objects),'triangles':triangles,'materials':len(materials),'materialNames':sorted(materials),'bounds':{'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]},'coordinateSystem':'world Y-up / glTF Y-up'}

def finish_scene():
    bpy.context.view_layer.update()
    return _metadata(_objects())

def _output(path):
    path=os.path.abspath(path)
    os.makedirs(os.path.dirname(path),exist_ok=True)
    return path

def save_source(path,collection=None,prefix=None):
    start=time.monotonic()
    path=_output(path)
    if bpy.data.libraries:
        raise ValueError('Source must not contain linked libraries')
    bpy.ops.file.pack_all()
    objects=_objects(collection,prefix)
    result=_metadata(objects)
    if collection is None and prefix is None:
        bpy.ops.wm.save_as_mainfile(filepath=path,compress=False,copy=True)
    else:
        scene=bpy.data.scenes.new('Reusable component')
        copies=[]
        try:
            for original in objects:
                obj=original.copy()
                obj.parent=None
                obj.matrix_world=original.matrix_world.copy()
                scene.collection.objects.link(obj)
                copies.append(obj)
            bpy.data.libraries.write(path,{scene},path_remap='RELATIVE_ALL',fake_user=True,compress=False)
        finally:
            bpy.data.scenes.remove(scene)
            for obj in copies:
                bpy.data.objects.remove(obj,do_unlink=True)
    result.update(path=path,bytes=os.path.getsize(path),elapsedSeconds=round(time.monotonic()-start,3))
    return result

def _has_texture(material):
    if material is None or not material.use_nodes or material.node_tree is None:
        return False
    pending=[material.node_tree]
    seen=set()
    while pending:
        tree=pending.pop()
        if tree in seen:
            continue
        seen.add(tree)
        for node in tree.nodes:
            if node.type in {'TEX_IMAGE','TEX_ENVIRONMENT'}:
                return True
            if node.type=='GROUP' and node.node_tree is not None:
                pending.append(node.node_tree)
    return False


def _mesh_layout(data):
    # Joining incompatible active UV/color layouts can silently change material
    # inputs. Only batch compatible meshes; preserve all attribute data otherwise.
    return (tuple((uv.name, uv.active_render) for uv in data.uv_layers),
            tuple((color.name, color.domain, color.data_type) for color in data.color_attributes),
            data.color_attributes.active_color_name, data.color_attributes.render_color_index)


def export_runtime(path,collection=None,prefix=None):
    start=time.monotonic()
    path=_output(path)
    originals=_objects(collection,prefix)
    result=_metadata(originals)
    deps=bpy.context.evaluated_depsgraph_get()
    groups={}
    temporary=[]
    meshes=[]
    previous_selected=list(bpy.context.selected_objects)
    previous_active=bpy.context.view_layer.objects.active
    try:
        bpy.ops.object.select_all(action='DESELECT')
        for original in originals:
            evaluated=original.evaluated_get(deps)
            data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps)
            meshes.append(data)
            # Bake into a common basis before freezing the evaluated normals.
            # Letting join apply non-uniform scales changes smooth shading.
            mirrored=original.matrix_world.determinant()<0
            basis=Matrix.Diagonal((-1,1,1,1)) if mirrored else Matrix.Identity(4)
            transform=basis.inverted() @ original.matrix_world
            try:
                normal_matrix=transform.to_3x3().inverted().transposed()
            except ValueError:
                # A plane with a zero-scale normal axis is still valid visible
                # geometry. Recalculate on the transformed copy rather than
                # substituting a false inverse or rejecting the entire asset.
                data.transform(transform)
                data.normals_split_custom_set([(0,0,0)]*len(data.loops))
                data.update()
                normals=[tuple(normal.vector) for normal in data.corner_normals]
            else:
                normals=[tuple((normal_matrix @ normal.vector).normalized()) for normal in data.corner_normals]
                data.transform(transform)
            data.normals_split_custom_set(normals)
            # Resolve object-linked material overrides before baking a static copy.
            for index,slot in enumerate(evaluated.material_slots):
                if index < len(data.materials):
                    data.materials[index]=slot.material
            # Solid-color glTF materials have no UV inputs. Drop only those
            # unused runtime layers, retaining all UVs in the editable source.
            if not any(_has_texture(material) for material in data.materials):
                for uv in list(data.uv_layers):
                    data.uv_layers.remove(uv)
            obj=bpy.data.objects.new('runtime_'+original.name,data)
            obj.matrix_world=basis
            bpy.context.scene.collection.objects.link(obj)
            temporary.append(obj)
            # Blender's join operator changes shading when mirrored and
            # non-mirrored objects share a batch. Retain separate handedness.
            groups.setdefault((_mesh_layout(data),mirrored),[]).append(obj)
        batches=[]
        for objects in groups.values():
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:
                bpy.ops.object.join()
            batches.append(objects[0])
        bpy.ops.object.select_all(action='DESELECT')
        for obj in batches:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=batches[0]
        bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=False,export_texcoords=True,export_normals=True,export_materials='EXPORT')
    finally:
        # join() deletes the other objects but leaves their unused mesh data.
        for obj in temporary:
            try:
                bpy.data.objects.remove(obj,do_unlink=True)
            except ReferenceError:
                pass
        for data in meshes:
            if data.users == 0:
                bpy.data.meshes.remove(data)
        for obj in previous_selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=previous_active
    with open(path,'rb') as file:
        header=file.read(20)
        json_length=struct.unpack_from('<I',header,12)[0]
        document=json.loads(file.read(json_length))
    primitives=[p for mesh in document.get('meshes',[]) for p in mesh['primitives']]
    result.update(path=path,bytes=os.path.getsize(path),drawGroups=len(primitives),
                  runtimeVertices=sum(document['accessors'][p['attributes']['POSITION']]['count'] for p in primitives),
                  elapsedSeconds=round(time.monotonic()-start,3))
    return result


# Start cheaply, inspect, then spend more samples only on an accepted composition.
_PREVIEW_QUALITY={
    'draft': {'size':256,'samples':8,'noise':.10,'minimum':4,'seconds':10},
    'review': {'size':512,'samples':32,'noise':.04,'minimum':8,'seconds':15},
    'final': {'size':1024,'samples':128,'noise':.01,'minimum':16,'seconds':20},
}
_PREVIEW_VIEWS={'isometric':(1,-1,.9),'front':(0,-1,0),'side':(1,0,0),'top':(0,0,1)}


def render_preview(path,size=None,samples=None,collection=None,prefix=None,*,quality='review',view='isometric'):
    if quality not in _PREVIEW_QUALITY or view not in _PREVIEW_VIEWS:
        raise ValueError('Choose draft/review/final quality and isometric/front/side/top view')
    preset=_PREVIEW_QUALITY[quality]
    size=preset['size'] if size is None else size
    samples=preset['samples'] if samples is None else samples
    if type(size) is not int or not 1<=size<=1024 or type(samples) is not int or not 1<=samples<=128:
        raise ValueError('Preview size must be 1–1024 pixels and samples 1–128')
    start=time.monotonic()
    path=_output(path)
    scene=bpy.context.scene
    selected=_objects(collection,prefix)
    bounds=_metadata(selected)['bounds']
    # Preview rendering must not become an accidental edit to the saved project.
    render=scene.render
    old_render={key:getattr(render,key) for key in ('engine','resolution_x','resolution_y','resolution_percentage','film_transparent','filepath','threads_mode','threads')}
    old_cycles={key:getattr(scene.cycles,key) for key in ('device','samples','use_denoising','denoiser','use_adaptive_sampling','adaptive_threshold','adaptive_min_samples','time_limit')}
    old_format=render.image_settings.file_format
    old_media_type=getattr(render.image_settings,'media_type',None)
    oldcamera,oldworld=scene.camera,scene.world
    hidden=[]
    camera=light=data=lightdata=preview_world=None
    try:
        if collection is not None or prefix is not None:
            chosen=set(selected)
            for obj in scene.objects:
                if obj.type in {'MESH','CURVE','SURFACE','FONT'} and obj not in chosen:
                    hidden.append((obj,obj.hide_render))
                    obj.hide_render=True
        center=[(a+b)*.5 for a,b in zip(bounds['min'],bounds['max'])]
        span=max(b-a for a,b in zip(bounds['min'],bounds['max']))
        target=_v(center)
        data=bpy.data.cameras.new('Preview camera')
        camera=bpy.data.objects.new('Preview camera',data)
        scene.collection.objects.link(camera)
        camera.location=target+Vector(_PREVIEW_VIEWS[view])*max(span,1)*1.5
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        data.type='ORTHO'
        data.ortho_scale=max(span,1)*1.5
        lightdata=bpy.data.lights.new('Preview sun','SUN')
        light=bpy.data.objects.new('Preview sun',lightdata)
        scene.collection.objects.link(light)
        lightdata.energy=2.5
        light.rotation_euler=(.45,-.55,-.4)
        scene.camera=camera
        render.engine='CYCLES'
        scene.cycles.device='CPU'
        scene.cycles.samples=samples
        scene.cycles.use_denoising=True
        scene.cycles.denoiser='OPENIMAGEDENOISE'
        scene.cycles.use_adaptive_sampling=True
        scene.cycles.adaptive_threshold=preset['noise']
        scene.cycles.adaptive_min_samples=min(samples,preset['minimum'])
        # Sampling time is bounded; scene setup and denoising take additional time.
        scene.cycles.time_limit=preset['seconds']
        render.threads_mode='FIXED'
        render.threads=4  # Modal's two physical cores expose four vCPUs.
        render.resolution_x=size
        render.resolution_y=size
        render.resolution_percentage=100
        if old_media_type is not None: render.image_settings.media_type='IMAGE'
        render.image_settings.file_format='PNG'
        render.film_transparent=False
        preview_world=oldworld.copy() if oldworld else bpy.data.worlds.new('Preview daylight')
        scene.world=preview_world
        preview_world.color=(.55,.60,.65)
        preview_world.use_nodes=True
        background=preview_world.node_tree.nodes.get('Background')
        if background:
            background.inputs['Color'].default_value=(.72,.79,.86,1)
            background.inputs['Strength'].default_value=.65
        render.filepath=path
        bpy.ops.render.render(write_still=True)
    finally:
        scene.camera,scene.world=oldcamera,oldworld
        for key,value in old_render.items():
            setattr(render,key,value)
        for key,value in old_cycles.items():
            setattr(scene.cycles,key,value)
        if old_media_type is not None: render.image_settings.media_type=old_media_type
        render.image_settings.file_format=old_format
        for obj,was_hidden in hidden:
            obj.hide_render=was_hidden
        for obj in (camera,light):
            if obj is not None:
                bpy.data.objects.remove(obj,do_unlink=True)
        if data is not None:
            bpy.data.cameras.remove(data)
        if lightdata is not None:
            bpy.data.lights.remove(lightdata)
        if preview_world is not None:
            bpy.data.worlds.remove(preview_world)
    return {'path':path,'bytes':os.path.getsize(path),'elapsedSeconds':round(time.monotonic()-start,3),
            'size':size,'samples':samples,'quality':quality,'view':view,'device':'CPU',
            'samplingTimeLimitSeconds':preset['seconds']}
