"""Physical-scale UV assignment shared by bundled and contributed materials."""
from __future__ import annotations
import math


def assign_material(obj, surface, *, tile_size=2.0, projection='surface', center=None, direction=None):
    from mathutils import Vector
    if obj.type != 'MESH':
        raise ValueError('Apply materials to a mesh object.')
    size = (tile_size, tile_size) if isinstance(tile_size, (int, float)) else tuple(tile_size)
    if len(size) != 2 or any(not isinstance(n, (int, float)) or not math.isfinite(n) or n <= 0 for n in size):
        raise ValueError('Use a positive physical tile width and height.')
    if projection not in {'box', 'surface', 'cylindrical', 'existing'}:
        raise ValueError('Unknown UV projection.')
    if projection == 'existing' and not obj.data.uv_layers:
        raise ValueError('The mesh needs an existing UV map.')
    origin = Vector(center or (0, 0, 0))
    grain = Vector(direction or (1, 0, 0))
    if len(origin) != 3 or len(grain) != 3 or not all(math.isfinite(n) for n in (*origin, *grain)) or grain.length < 1e-8:
        raise ValueError('Use finite three-component mapping vectors and a nonzero grain direction.')
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    if projection != 'existing':
        uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='AgarthaUV')
        uv.active_render = True
        points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        normal_matrix = obj.matrix_world.to_3x3().inverted_safe().transposed()
        radius = max((math.hypot(p.x-origin.x, p.y-origin.y) for p in points), default=1)
        repeats = radius * math.tau / size[0]
        if repeats >= 1: repeats = max(1, round(repeats))
        for polygon in obj.data.polygons:
            normal = (normal_matrix @ polygon.normal).normalized()
            axis = max(range(3), key=lambda i: abs(normal[i]))
            midpoint = sum((points[index] for index in polygon.vertices), Vector()) / max(1,len(polygon.vertices)) - origin
            radial = Vector((midpoint.x,midpoint.y,0))
            cylindrical = projection == 'cylindrical' and abs(normal.z) < .7 and radial.length > 1e-8 and abs(normal.dot(radial.normalized())) > .7
            planar = projection == 'surface' or projection == 'cylindrical' and not cylindrical
            if planar:
                tangent = grain - normal * grain.dot(normal)
                if tangent.length < 1e-6:
                    fallback = Vector((0, 1, 0)) if abs(normal.y) < .9 else Vector((0, 0, 1))
                    tangent = fallback - normal * fallback.dot(normal)
                tangent.normalize()
                bitangent = normal.cross(tangent).normalized()
            values = []
            for index in polygon.loop_indices:
                point = points[obj.data.loops[index].vertex_index] - origin
                if cylindrical:
                    value = (math.atan2(point.y, point.x) / math.tau, point.z / size[1])
                elif planar:
                    value = (point.dot(tangent) / size[0], point.dot(bitangent) / size[1])
                else:
                    axes = (0, 1) if projection == 'cylindrical' else (1, 2) if axis == 0 else (0, 2) if axis == 1 else (0, 1)
                    value = (point[axes[0]] / size[0], point[axes[1]] / size[1])
                values.append((index, value))
            seam = cylindrical and values and max(v[0] for _, v in values)-min(v[0] for _, v in values) > .5
            for index, (u, v) in values:
                if cylindrical:
                    u = (u + (1 if seam and u < 0 else 0)) * repeats
                uv.data[index].uv = (u, v)
    obj.data.materials.clear()
    obj.data.materials.append(surface)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    return surface


def mapping_report(obj):
    """Report collapsed or stretched UV triangles before a visual review."""
    import numpy as np
    from mathutils import Vector
    uv = obj.data.uv_layers.active
    if uv is None:
        return {'triangles': 0, 'collapsed': 0, 'stretched': 0, 'maxAnisotropy': None, 'error': 'Missing UVs'}
    obj.data.calc_loop_triangles()
    collapsed = stretched = count = 0
    worst = 1.0
    for triangle in obj.data.loop_triangles:
        points = [obj.matrix_world @ obj.data.vertices[index].co for index in triangle.vertices]
        e1, e2 = points[1]-points[0], points[2]-points[0]
        if e1.length < 1e-8 or e1.cross(e2).length < 1e-10:
            continue
        uvs = [Vector(uv.data[index].uv) for index in triangle.loops]
        tangent = e1.normalized()
        y = e2 - tangent * e2.dot(tangent)
        physical = np.array([[e1.length, e2.dot(tangent)], [0, y.length]])
        texture = np.array([[uvs[1].x-uvs[0].x, uvs[2].x-uvs[0].x], [uvs[1].y-uvs[0].y, uvs[2].y-uvs[0].y]])
        singular = np.linalg.svd(texture @ np.linalg.inv(physical), compute_uv=False)
        count += 1
        if singular[-1] < 1e-8:
            collapsed += 1
            continue
        ratio = float(singular[0]/singular[-1])
        worst = max(worst, ratio)
        if ratio > 2:
            stretched += 1
    return {'triangles': count, 'collapsed': collapsed, 'stretched': stretched, 'maxAnisotropy': round(worst, 3)}
