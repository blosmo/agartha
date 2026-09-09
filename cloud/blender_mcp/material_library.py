"""Blender adapter for Agartha's shared, bundled PBR catalog.

No network requests. Packed image/Principled materials survive glTF export.
"""
from __future__ import annotations
import json
import math
import os
from pathlib import Path

CATALOG = Path(__file__).with_name('material_catalog.json')


def catalog() -> dict:
    return json.loads(CATALOG.read_text())


def list_materials() -> dict:
    data = catalog()
    return {'materials': data['entries'], 'finishes': data['blenderFinishes'],
            'usage': 'apply_material(object, material_id, finish_id=None, tile_size=2.0, projection="box"); images are packed for GLB.'}


def _asset(path: str) -> Path:
    root = Path(os.environ.get('AGARTHA_MATERIAL_ROOT', '/opt/agartha-assets')).resolve()
    target = (root / path.lstrip('/')).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise ValueError('Bundled material map is unavailable: ' + path)
    return target


def _load(path: str, data: bool = False):
    import bpy
    image = bpy.data.images.load(str(_asset(path)), check_existing=True)
    image.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    image.pack()
    return image


def _generated(name, pixels, data=False):
    import bpy
    import numpy as np
    root = Path(os.environ.get('AGARTHA_MATERIAL_CACHE', '/tmp/agartha-pbr'))
    root.mkdir(parents=True, exist_ok=True)
    height, width = pixels.shape[:2]
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(pixels[:, :, :3], 0, 1)
    image = bpy.data.images.new(name, width=width, height=height, alpha=False)
    image.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    image.pixels.foreach_set(rgba.ravel())
    image.file_format = 'PNG' if data else 'JPEG'
    path = root / (name + ('.png' if data else '.jpg'))
    image.filepath_raw = str(path)
    image.save()
    bpy.data.images.remove(image)
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    image.pack()
    return image


def _finish_maps(recipe, base):
    """Portable shader output: albedo, ARM and tangent normal, with no lighting."""
    import numpy as np
    size = 1024
    v, u = np.mgrid[0:size, 0:size].astype(np.float32) / size
    # Seeded periodic value noise gives organic variation and seamless tile edges.
    noise = np.zeros_like(u)
    for index, (frequency, weight) in enumerate([(4,.45),(9,.25),(19,.15),(41,.1),(97,.05)]):
        grid=np.random.default_rng(314159+index).random((frequency,frequency)).astype(np.float32)
        x=u*frequency;y=v*frequency;ix=np.floor(x).astype(int);iy=np.floor(y).astype(int)
        fx=x-ix;fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
        low=grid[iy%frequency,ix%frequency]*(1-fx)+grid[iy%frequency,(ix+1)%frequency]*fx
        high=grid[(iy+1)%frequency,ix%frequency]*(1-fx)+grid[(iy+1)%frequency,(ix+1)%frequency]*fx
        noise += weight*(low*(1-fy)+high*fy)
    noise=np.clip(.5+(noise-.5)*1.6,0,1)
    color = np.asarray(recipe['color'], dtype=np.float32)
    accent = np.asarray(recipe['accent'], dtype=np.float32)
    kind = recipe['kind']
    if kind == 'patina':
        mask = np.clip((noise-.43)*4.5, 0, 1)
        albedo = color[None,None,:]*(1-mask[:,:,None]) + accent[None,None,:]*mask[:,:,None]
        albedo *= (.82 + .3*noise[:,:,None])
        roughness = recipe['roughness'] + .36*mask
        metallic = recipe['metalness']*(1-mask) + .08*mask
        height = noise*.02
    elif kind == 'masonry':
        row = np.floor(v*8)
        x = np.mod(u*4 + np.mod(row,2)*.5, 1)
        y = np.mod(v*8, 1)
        edge = np.minimum(np.minimum(x,1-x)*.5, np.minimum(y,1-y))
        face = np.clip(edge/.045,0,1)
        block = .9 + .1*np.sin(np.floor(u*4+np.mod(row,2)*.5)*31 + row*17)
        albedo = color[None,None,:]*(.9+.16*noise[:,:,None])*block[:,:,None]
        albedo = albedo*face[:,:,None] + accent[None,None,:]*(1-face[:,:,None])
        roughness = recipe['roughness'] + .1*(1-face) + .04*noise
        metallic = np.zeros_like(u)
        height = face*.025 + noise*.003
    elif kind == 'mineral':
        albedo=color[None,None,:]*(.82+.28*noise[:,:,None])
        roughness=recipe['roughness']+.08*noise
        metallic=np.zeros_like(u)
        height=noise*.004
    else:
        band = .5+.5*np.sin(2*math.pi*v*8 + (noise-.5)*7)
        mask = np.clip(band*.35 + noise*.45,0,1)
        albedo = color[None,None,:]*(1-mask[:,:,None])+accent[None,None,:]*mask[:,:,None]
        albedo *= .78 + .35*noise[:,:,None]
        roughness = recipe['roughness'] + .08*noise
        metallic = np.zeros_like(u)
        height = noise*.025 + band*.008
    arm = np.stack([np.ones_like(u),np.clip(roughness,0,1),metallic],axis=-1)
    dx = (np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*size*.22
    dy = (np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*size*.22
    normals = np.stack([-dx,-dy,np.ones_like(u)],axis=-1)
    normals /= np.linalg.norm(normals,axis=-1,keepdims=True)
    # Retain the scanned micro-normal detail beneath the reusable finish.
    image = base['normal']; raw = np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(raw)
    original = raw.reshape(image.size[1],image.size[0],4)[:,:,:3]
    iy=(np.arange(size)*image.size[1]//size).astype(int);ix=(np.arange(size)*image.size[0]//size).astype(int)
    detail=original[iy[:,None],ix[None,:]]*2-1
    normals[:,:,:2] += detail[:,:,:2]*.3
    normals /= np.linalg.norm(normals,axis=-1,keepdims=True)
    prefix='agartha-'+recipe['id']
    return {'albedo':_generated(prefix+'-albedo',albedo),
            'arm':_generated(prefix+'-arm',arm,True),
            'normal':_generated(prefix+'-normal',normals*.5+.5,True)}


def material(material_id: str, *, finish_id: str | None = None):
    import bpy
    entries = catalog()
    definition = next((entry for entry in entries['entries'] if entry['id']==material_id),None)
    if definition is None: raise ValueError('Unknown Agartha material ID.')
    recipe = next((entry for entry in entries['blenderFinishes'] if entry['id']==finish_id),None) if finish_id else None
    if finish_id and (recipe is None or recipe['baseMaterialId']!=material_id):
        raise ValueError('Choose the finish and its declared baseMaterialId from list_materials().')
    name='Agartha | '+(finish_id or material_id)
    existing=bpy.data.materials.get(name)
    if existing is not None: return existing
    maps={key:_load(path,key!='albedo') for key,path in definition.get('maps',{}).items()}
    if recipe: maps=_finish_maps(recipe,maps)
    result=bpy.data.materials.new(name); result.use_nodes=True
    result['agarthaMaterialId']=material_id
    result['agarthaSource']=definition['source'];result['agarthaLicense']=definition['license']
    if finish_id: result['agarthaFinishId']=finish_id
    nodes=result.node_tree.nodes;links=result.node_tree.links;nodes.clear()
    shader=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    rgb=tuple(int(definition['color'][i:i+2],16)/255 for i in (1,3,5))
    rgb=tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb)
    shader.inputs['Base Color'].default_value=(*rgb,1)
    shader.inputs['Roughness'].default_value=definition['roughness'];shader.inputs['Metallic'].default_value=definition['metalness']
    for channel,image in maps.items():
        texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.label=channel;texture.extension='REPEAT'
        if channel=='albedo':links.new(texture.outputs['Color'],shader.inputs['Base Color'])
        elif channel=='normal':
            normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65
            links.new(texture.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
        else:
            separate=nodes.new('ShaderNodeSeparateColor');separate.mode='RGB';links.new(texture.outputs['Color'],separate.inputs['Color'])
            links.new(separate.outputs['Green'],shader.inputs['Roughness']);links.new(separate.outputs['Blue'],shader.inputs['Metallic'])
    return result


def apply_material(obj, material_id: str, *, finish_id: str | None = None,
                   tile_size: float = 2.0, projection: str = 'box', center=None):
    """Apply a catalog material with world-scale UVs; never modifies geometry."""
    from mathutils import Vector
    if obj.type!='MESH': raise ValueError('Apply materials to a mesh object.')
    if not math.isfinite(tile_size) or tile_size<=0: raise ValueError('Use a positive tile size in Blender units.')
    if projection not in {'box','cylindrical','existing'}: raise ValueError('Unknown UV projection.')
    if projection=='existing' and not obj.data.uv_layers: raise ValueError('The mesh needs an existing UV map.')
    surface=material(material_id,finish_id=finish_id)
    # Do not change linked instances or another object's material slots/UVs.
    if obj.data.users>1: obj.data=obj.data.copy()
    if projection!='existing':
        uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='AgarthaUV')
        points=[obj.matrix_world @ v.co for v in obj.data.vertices]
        normal_matrix=obj.matrix_world.to_3x3().inverted_safe().transposed()
        origin=Vector(center or (0,0,0))
        radial_scale=max((math.hypot(p.x-origin.x,p.y-origin.y) for p in points),default=1)*math.tau/tile_size
        for polygon in obj.data.polygons:
            normal=normal_matrix@polygon.normal;axis=max(range(3),key=lambda i:abs(normal[i]))
            values=[]
            for loop_index in polygon.loop_indices:
                point=points[obj.data.loops[loop_index].vertex_index]
                if projection=='cylindrical' and axis!=2:
                    p=point-origin;values.append((loop_index,(math.atan2(p.y,p.x)/math.tau,point.z/tile_size)))
                else:
                    axes=(1,2) if axis==0 else (0,2) if axis==1 else (0,1)
                    values.append((loop_index,(point[axes[0]]/tile_size,point[axes[1]]/tile_size)))
            seam=projection=='cylindrical' and axis!=2 and values and max(v[0] for _,v in values)-min(v[0] for _,v in values)>.5
            for index,value in values:
                u=value[0]+(1 if seam and value[0]<0 else 0)
                uv.data[index].uv=(u*radial_scale if projection=='cylindrical' and axis!=2 else u,value[1])
    obj.data.materials.clear();obj.data.materials.append(surface)
    for polygon in obj.data.polygons:polygon.material_index=0
    return surface
