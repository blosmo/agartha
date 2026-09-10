"""Editable Blender 5.2 Geometry Nodes tools, with Y-up public positions.

create_arch(name='Arch', width=3, height=4, thickness=.35, depth=.6, ...)
create_stairs(name='Stairs', steps=8, width=2, run=.3, rise=.2, ...)
create_column(name='Column', radius=.5, height=3, vertices=32, ...)
create_rock_cluster(name='Rocks', rocks=6, radius=1, resolution=20, seed=7, ...)
All constructors accept loc=(0,0,0), material=None, bevel=0.02, segments=2.
set_parameters(obj, **values) accepts lowercase interface names (spaces -> _).
add_mesh_bevel(obj, width=.02, segments=2) -> editable NodesModifier.

Generators have empty source meshes; only evaluated nodes produce geometry.
Shared finishing passes bevel/material settings in a typed bundle to an evaluated
closure. Keep the .blend source; use starter_kit.export_runtime for static GLB.
"""
import math
import bpy


_STYLE = [('Bevel', 'NodeSocketFloat', .02, 0, .2), ('Segments', 'NodeSocketInt', 2, 1, 4),
          ('Material', 'NodeSocketMaterial', None, None, None)]


def _check(value, name, low, high, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(name + ' must be finite and numeric')
    if not low <= value <= high or integer and int(value) != value:
        raise ValueError(f'{name} must be {"an integer " if integer else ""}in [{low}, {high}]')
    return int(value) if integer else float(value)


def _location(loc):
    if len(loc) != 3:
        raise ValueError('loc must contain three Y-up coordinates')
    x, y, z = (_check(v, 'loc', -10000, 10000) for v in loc)
    return (x, -z, y)


def _socket(group, name, kind, default=None, low=None, high=None, output=False):
    item = group.interface.new_socket(name=name, in_out='OUTPUT' if output else 'INPUT', socket_type=kind)
    if default is not None:
        item.default_value = default
    if low is not None:
        item.min_value, item.max_value = low, high
    return item


def _group(name, parameters, geometry_input=False):
    group = bpy.data.node_groups.new(name, 'GeometryNodeTree')
    group.is_modifier = True
    if geometry_input:
        _socket(group, 'Geometry', 'NodeSocketGeometry')
    for args in parameters:
        _socket(group, *args)
    _socket(group, 'Geometry', 'NodeSocketGeometry', output=True)
    return group, group.nodes.new('NodeGroupInput'), group.nodes.new('NodeGroupOutput')


def _wire(group, value, socket):
    if isinstance(value, bpy.types.NodeSocket):
        group.links.new(value, socket)
    else:
        socket.default_value = value


def _math(group, operation, a, b):
    node = group.nodes.new('ShaderNodeMath'); node.operation = operation
    _wire(group, a, node.inputs[0]); _wire(group, b, node.inputs[1])
    return node.outputs[0]


def _xyz(group, x=0, y=0, z=0):
    node = group.nodes.new('ShaderNodeCombineXYZ')
    for key, value in zip(('X', 'Y', 'Z'), (x, y, z)):
        _wire(group, value, node.inputs[key])
    return node.outputs['Vector']


def _transform(group, geometry, location=(0, 0, 0), rotation=(0, 0, 0)):
    node = group.nodes.new('GeometryNodeTransform')
    _wire(group, geometry, node.inputs['Geometry']); _wire(group, location, node.inputs['Translation'])
    node.inputs['Rotation'].default_value = rotation
    return node.outputs['Geometry']


def _cube(group, size, location):
    node = group.nodes.new('GeometryNodeMeshCube')
    _wire(group, size, node.inputs['Size'])
    return _transform(group, node.outputs['Mesh'], location)


def _join(group, geometries):
    node = group.nodes.new('GeometryNodeJoinGeometry')
    for geometry in geometries:
        _wire(group, geometry, node.inputs['Geometry'])
    return node.outputs['Geometry']


def _bevel(group, geometry, width, segments):
    node = group.nodes.new('GeometryNodeMeshBevel')
    _wire(group, geometry, node.inputs['Mesh'])
    for key in ('Start Left Offset', 'Start Right Offset', 'End Left Offset', 'End Right Offset', 'Offset'):
        _wire(group, width, node.inputs[key])
    _wire(group, segments, node.inputs['Segments'])
    return node.outputs['Mesh']


def _finishing_group():
    name = 'AGARTHA_Finish_52_v1'
    existing = bpy.data.node_groups.get(name)
    if existing:
        return existing
    group, inputs, output = _group(name, _STYLE, geometry_input=True)
    bundle = group.nodes.new('NodeCombineBundle')
    bundle.define_signature = True
    for kind, field in [('FLOAT', 'Bevel'), ('INT', 'Segments'), ('MATERIAL', 'Material')]:
        bundle.bundle_items.new(kind, field)
        group.links.new(inputs.outputs[field], bundle.inputs[field])
    closure_out = group.nodes.new('NodeClosureOutput')
    closure_out.define_signature = True
    closure_out.input_items.new('GEOMETRY', 'Geometry')
    closure_out.input_items.new('BUNDLE', 'Style')
    closure_out.output_items.new('GEOMETRY', 'Geometry')
    closure_in = group.nodes.new('NodeClosureInput')
    closure_in.pair_with_output(closure_out)
    separate = group.nodes.new('NodeSeparateBundle')
    separate.define_signature = True
    for kind, field in [('FLOAT', 'Bevel'), ('INT', 'Segments'), ('MATERIAL', 'Material')]:
        separate.bundle_items.new(kind, field)
    group.links.new(closure_in.outputs['Style'], separate.inputs['Bundle'])
    geometry = _bevel(group, closure_in.outputs['Geometry'], separate.outputs['Bevel'], separate.outputs['Segments'])
    material = group.nodes.new('GeometryNodeSetMaterial')
    group.links.new(geometry, material.inputs['Geometry'])
    group.links.new(separate.outputs['Material'], material.inputs['Material'])
    group.links.new(material.outputs['Geometry'], closure_out.inputs['Geometry'])
    evaluate = group.nodes.new('NodeEvaluateClosure')
    evaluate.define_signature = True
    evaluate.input_items.new('GEOMETRY', 'Geometry')
    evaluate.input_items.new('BUNDLE', 'Style')
    evaluate.output_items.new('GEOMETRY', 'Geometry')
    group.links.new(closure_out.outputs['Closure'], evaluate.inputs['Closure'])
    group.links.new(inputs.outputs['Geometry'], evaluate.inputs['Geometry'])
    group.links.new(bundle.outputs['Bundle'], evaluate.inputs['Style'])
    group.links.new(evaluate.outputs['Geometry'], output.inputs['Geometry'])
    return group


def _finish(group, inputs, output, geometry):
    node = group.nodes.new('GeometryNodeGroup'); node.node_tree = _finishing_group()
    group.links.new(geometry, node.inputs['Geometry'])
    for name, *_ in _STYLE:
        group.links.new(inputs.outputs[name], node.inputs[name])
    group.links.new(node.outputs['Geometry'], output.inputs['Geometry'])


def _material(value):
    if value is not None:
        if not isinstance(value, bpy.types.Material):
            raise ValueError('material must be a Blender Material')
        return value
    material = bpy.data.materials.get('AGARTHA_Default_52')
    if material is None:
        material = bpy.data.materials.new('AGARTHA_Default_52'); material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (.3, .42, .36, 1)
        shader.inputs['Roughness'].default_value = .72
    return material


def _style(bevel, segments, material):
    return [('Bevel', 'NodeSocketFloat', _check(bevel, 'bevel', 0, .2), 0, .2),
            ('Segments', 'NodeSocketInt', _check(segments, 'segments', 1, 4, True), 1, 4),
            ('Material', 'NodeSocketMaterial', _material(material), None, None)]


def _object(name, group, parameters, loc, generator):
    obj = bpy.data.objects.new(name, bpy.data.meshes.new(name + ' Source'))
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    modifier = obj.modifiers.new('Agartha ' + generator, 'NODES'); modifier.node_group = group
    # Blender 5.2 stores values in typed RNA interfaces, not modifier ID props.
    for item in group.interface.items_tree:
        if getattr(item, 'in_out', None) == 'INPUT' and item.socket_type != 'NodeSocketGeometry':
            getattr(modifier.properties.inputs, item.identifier).value = item.default_value
    obj['agartha_generator'] = generator
    obj.update_tag(); bpy.context.view_layer.update()
    return obj


def create_arch(name='Arch', width=3, height=4, thickness=.35, depth=.6, loc=(0, 0, 0), material=None, bevel=.02, segments=2):
    """A semicircular arch with square piers; width/height are outer dimensions."""
    width = _check(width, 'width', .4, 30); height = _check(height, 'height', .3, 40)
    thickness = _check(thickness, 'thickness', .05, 5); depth = _check(depth, 'depth', .05, 10)
    if thickness >= width/2 or height <= width/2:
        raise ValueError('Arch needs thickness < width/2 and height > width/2')
    loc = _location(loc)
    parameters = [('Width', 'NodeSocketFloat', width, .4, 30), ('Height', 'NodeSocketFloat', height, .3, 40),
                  ('Thickness', 'NodeSocketFloat', thickness, .05, 5), ('Depth', 'NodeSocketFloat', depth, .05, 10)] + _style(bevel, segments, material)
    group, inputs, output = _group(name, parameters)
    w, h, t, d = (inputs.outputs[k] for k in ('Width', 'Height', 'Thickness', 'Depth'))
    radius = _math(group, 'MULTIPLY', _math(group, 'SUBTRACT', w, t), .5)
    spring = _math(group, 'MAXIMUM', _math(group, 'SUBTRACT', h, _math(group, 'MULTIPLY', w, .5)), .05)
    circle = group.nodes.new('GeometryNodeCurvePrimitiveCircle'); circle.inputs['Resolution'].default_value = 64
    group.links.new(radius, circle.inputs['Radius'])
    trim = group.nodes.new('GeometryNodeTrimCurve'); trim.mode = 'FACTOR'; trim.inputs['End'].default_value = .5
    group.links.new(circle.outputs['Curve'], trim.inputs['Curve'])
    arc = _transform(group, trim.outputs['Curve'], _xyz(group, z=spring), (math.pi/2, 0, 0))
    profile = group.nodes.new('GeometryNodeCurvePrimitiveQuadrilateral'); profile.mode = 'RECTANGLE'
    group.links.new(d, profile.inputs['Width']); group.links.new(t, profile.inputs['Height'])
    tube = group.nodes.new('GeometryNodeCurveToMesh'); tube.inputs['Fill Caps'].default_value = True
    group.links.new(arc, tube.inputs['Curve']); group.links.new(profile.outputs['Curve'], tube.inputs['Profile Curve'])
    size = _xyz(group, t, d, spring)
    piers = [_cube(group, size, _xyz(group, _math(group, 'MULTIPLY', radius, sign), 0, _math(group, 'MULTIPLY', spring, .5))) for sign in (-1, 1)]
    _finish(group, inputs, output, _join(group, [*piers, tube.outputs['Mesh']]))
    return _object(name, group, parameters, loc, 'arch')


def create_stairs(name='Stairs', steps=8, width=2, run=.3, rise=.2, loc=(0, 0, 0), material=None, bevel=.02, segments=2):
    """Solid steps ascend along public +Z, with their bottoms on Y=0."""
    parameters = [('Steps', 'NodeSocketInt', _check(steps, 'steps', 1, 64, True), 1, 64),
                  ('Width', 'NodeSocketFloat', _check(width, 'width', .1, 20), .1, 20),
                  ('Run', 'NodeSocketFloat', _check(run, 'run', .05, 2), .05, 2),
                  ('Rise', 'NodeSocketFloat', _check(rise, 'rise', .02, 2), .02, 2)]
    loc = _location(loc); parameters += _style(bevel, segments, material)
    group, inputs, output = _group(name, parameters)
    count, w, r, h = (inputs.outputs[k] for k in ('Steps', 'Width', 'Run', 'Rise'))
    line = group.nodes.new('GeometryNodeMeshLine')
    group.links.new(count, line.inputs['Count'])
    group.links.new(_xyz(group, 0, _math(group, 'MULTIPLY', r, -.5), _math(group, 'MULTIPLY', h, .5)), line.inputs['Start Location'])
    group.links.new(_xyz(group, 0, _math(group, 'MULTIPLY', r, -1), _math(group, 'MULTIPLY', h, .5)), line.inputs['Offset'])
    cube = group.nodes.new('GeometryNodeMeshCube'); group.links.new(_xyz(group, w, r, h), cube.inputs['Size'])
    instance = group.nodes.new('GeometryNodeInstanceOnPoints')
    group.links.new(line.outputs['Mesh'], instance.inputs['Points']); group.links.new(cube.outputs['Mesh'], instance.inputs['Instance'])
    index = group.nodes.new('GeometryNodeInputIndex')
    group.links.new(_xyz(group, 1, 1, _math(group, 'ADD', index.outputs['Index'], 1)), instance.inputs['Scale'])
    realize = group.nodes.new('GeometryNodeRealizeInstances'); group.links.new(instance.outputs['Instances'], realize.inputs['Geometry'])
    _finish(group, inputs, output, realize.outputs['Geometry'])
    return _object(name, group, parameters, loc, 'stairs')


def create_column(name='Column', radius=.5, height=3, vertices=32, loc=(0, 0, 0), material=None, bevel=.02, segments=2):
    """Cylindrical shaft, base and capital; the base starts at public Y=0."""
    parameters = [('Radius', 'NodeSocketFloat', _check(radius, 'radius', .05, 5), .05, 5),
                  ('Height', 'NodeSocketFloat', _check(height, 'height', .2, 30), .2, 30),
                  ('Vertices', 'NodeSocketInt', _check(vertices, 'vertices', 8, 64, True), 8, 64)]
    loc = _location(loc); parameters += _style(bevel, segments, material)
    group, inputs, output = _group(name, parameters)
    r, h, count = (inputs.outputs[k] for k in ('Radius', 'Height', 'Vertices'))
    base = _math(group, 'MINIMUM', _math(group, 'MULTIPLY', h, .12), _math(group, 'MULTIPLY', r, .5))
    geometries = []
    for radius_value, depth, z in [(r, base, _math(group, 'MULTIPLY', base, .5)),
                                 (r, base, _math(group, 'SUBTRACT', h, _math(group, 'MULTIPLY', base, .5))),
                                 (_math(group, 'MULTIPLY', r, .78), _math(group, 'SUBTRACT', h, _math(group, 'MULTIPLY', base, 2)), _math(group, 'MULTIPLY', h, .5))]:
        cylinder = group.nodes.new('GeometryNodeMeshCylinder'); cylinder.fill_type = 'NGON'
        group.links.new(count, cylinder.inputs['Vertices']); group.links.new(radius_value, cylinder.inputs['Radius']); group.links.new(depth, cylinder.inputs['Depth'])
        geometries.append(_transform(group, cylinder.outputs['Mesh'], _xyz(group, z=z)))
    _finish(group, inputs, output, _join(group, geometries))
    return _object(name, group, parameters, loc, 'column')


def create_rock_cluster(name='Rocks', rocks=6, radius=1, resolution=20, seed=7, loc=(0, 0, 0), material=None, bevel=0, segments=1):
    """Seeded point spheres fused through an SDF grid, returned as one mesh surface."""
    parameters = [('Rocks', 'NodeSocketInt', _check(rocks, 'rocks', 1, 24, True), 1, 24),
                  ('Radius', 'NodeSocketFloat', _check(radius, 'radius', .1, 5), .1, 5),
                  ('Resolution', 'NodeSocketInt', _check(resolution, 'resolution', 8, 40, True), 8, 40),
                  ('Seed', 'NodeSocketInt', _check(seed, 'seed', 0, 100000, True), 0, 100000)]
    loc = _location(loc); parameters += _style(bevel, segments, material)
    group, inputs, output = _group(name, parameters)
    line = group.nodes.new('GeometryNodeMeshLine'); group.links.new(inputs.outputs['Rocks'], line.inputs['Count'])
    random = group.nodes.new('FunctionNodeRandomValue'); random.data_type = 'FLOAT_VECTOR'
    random.inputs['Min'].default_value = (-1, -1, .8); random.inputs['Max'].default_value = (1, 1, 1.2)
    group.links.new(inputs.outputs['Seed'], random.inputs['Seed'])
    scale = group.nodes.new('ShaderNodeVectorMath'); scale.operation = 'SCALE'
    group.links.new(random.outputs['Value'], scale.inputs[0]); group.links.new(inputs.outputs['Radius'], scale.inputs['Scale'])
    position = group.nodes.new('GeometryNodeSetPosition'); group.links.new(line.outputs['Mesh'], position.inputs['Geometry']); group.links.new(scale.outputs['Vector'], position.inputs['Position'])
    points = group.nodes.new('GeometryNodeMeshToPoints'); points.mode = 'VERTICES'; group.links.new(position.outputs['Geometry'], points.inputs['Mesh'])
    grid = group.nodes.new('GeometryNodePointsToSDFGrid')
    group.links.new(points.outputs['Points'], grid.inputs['Points'])
    group.links.new(_math(group, 'MULTIPLY', inputs.outputs['Radius'], .7), grid.inputs['Radius'])
    group.links.new(_math(group, 'DIVIDE', inputs.outputs['Radius'], inputs.outputs['Resolution']), grid.inputs['Voxel Size'])
    smooth = group.nodes.new('GeometryNodeSDFGridLaplacian'); smooth.inputs['Iterations'].default_value = 2
    group.links.new(grid.outputs['SDF Grid'], smooth.inputs['Grid'])
    mesh = group.nodes.new('GeometryNodeGridToMesh'); mesh.inputs['Threshold'].default_value = 0; mesh.inputs['Adaptivity'].default_value = .1
    group.links.new(smooth.outputs['Grid'], mesh.inputs['Grid'])
    bounds = group.nodes.new('GeometryNodeBoundBox')
    group.links.new(mesh.outputs['Mesh'], bounds.inputs['Geometry'])
    separate = group.nodes.new('ShaderNodeSeparateXYZ')
    group.links.new(bounds.outputs['Min'], separate.inputs['Vector'])
    grounded = _transform(group, mesh.outputs['Mesh'], _xyz(group, z=_math(group, 'MULTIPLY', separate.outputs['Z'], -1)))
    shading = group.nodes.new('GeometryNodeSetShadeSmooth')
    group.links.new(grounded, shading.inputs[0])
    shading.inputs['Shade Smooth'].default_value = True
    _finish(group, inputs, output, shading.outputs[0])
    return _object(name, group, parameters, loc, 'rocks')


def set_parameters(obj, **values):
    """Atomically update validated exposed controls using lowercase names."""
    modifier = next((m for m in obj.modifiers if m.type == 'NODES'), None)
    if modifier is None:
        raise ValueError('Object has no Geometry Nodes modifier')
    sockets = {item.name.lower().replace(' ', '_'): item for item in modifier.node_group.interface.items_tree
               if getattr(item, 'in_out', None) == 'INPUT' and item.socket_type != 'NodeSocketGeometry'}
    current = {key: getattr(modifier.properties.inputs, item.identifier).value for key, item in sockets.items()}
    for key, value in values.items():
        if key not in sockets:
            raise ValueError('Unknown parameter: ' + key)
        item = sockets[key]
        current[key] = _material(value) if item.socket_type == 'NodeSocketMaterial' else _check(value, key, item.min_value, item.max_value, item.socket_type == 'NodeSocketInt')
    if obj.get('agartha_generator') == 'arch' and (current['thickness'] >= current['width']/2 or current['height'] <= current['width']/2):
        raise ValueError('Arch needs thickness < width/2 and height > width/2')
    for key in values:
        getattr(modifier.properties.inputs, sockets[key].identifier).value = current[key]
    obj.update_tag(); bpy.context.view_layer.update()
    return obj


def add_mesh_bevel(obj, width=.02, segments=2):
    """Append an editable Blender 5.2 Mesh Bevel node modifier."""
    if obj.type != 'MESH':
        raise ValueError('Bevel requires a mesh object')
    parameters = [('Width', 'NodeSocketFloat', _check(width, 'width', 0, .2), 0, .2),
                  ('Segments', 'NodeSocketInt', _check(segments, 'segments', 1, 4, True), 1, 4)]
    group, inputs, output = _group('Agartha Mesh Bevel', parameters, geometry_input=True)
    geometry = _bevel(group, inputs.outputs['Geometry'], inputs.outputs['Width'], inputs.outputs['Segments'])
    group.links.new(geometry, output.inputs['Geometry'])
    modifier = obj.modifiers.new('Agartha Mesh Bevel', 'NODES'); modifier.node_group = group
    obj.update_tag(); bpy.context.view_layer.update()
    return modifier
