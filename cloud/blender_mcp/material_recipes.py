"""Example node graphs. Agents may author any supported Principled texture graph."""
from __future__ import annotations


def _base(name):
    import bpy
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')
    coordinates = nodes.new('ShaderNodeTexCoord')
    return material, nodes, links, shader, coordinates.outputs['UV']


def _seamless_noise(nodes, links, uv, width, height):
    """Wrap UVs onto a 4D torus so grain meets across tile boundaries."""
    import math
    separate = nodes.new('ShaderNodeSeparateXYZ')
    links.new(uv,separate.inputs[0])
    components = []
    for axis,radius in [('X',width),('Y',height)]:
        angle = nodes.new('ShaderNodeMath')
        angle.operation = 'MULTIPLY'
        angle.inputs[1].default_value = math.tau
        links.new(separate.outputs[axis],angle.inputs[0])
        for function in ['COSINE','SINE']:
            wave = nodes.new('ShaderNodeMath')
            wave.operation = function
            links.new(angle.outputs[0],wave.inputs[0])
            scale = nodes.new('ShaderNodeMath')
            scale.operation = 'MULTIPLY'
            scale.inputs[1].default_value = radius
            links.new(wave.outputs[0],scale.inputs[0])
            components.append(scale.outputs[0])
    vector = nodes.new('ShaderNodeCombineXYZ')
    for i in range(3):links.new(components[i],vector.inputs[i])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.noise_dimensions = '4D'
    noise.inputs['Scale'].default_value = 1
    noise.inputs['Detail'].default_value = 2
    links.new(vector.outputs[0],noise.inputs['Vector'])
    links.new(components[3],noise.inputs['W'])
    return noise.outputs['Fac']


def _ramp(nodes, links, value, low, high):
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .2
    ramp.color_ramp.elements[0].color = (*low, 1)
    ramp.color_ramp.elements[1].position = .8
    ramp.color_ramp.elements[1].color = (*high, 1)
    links.new(value, ramp.inputs['Fac'])
    return ramp.outputs['Color']


def cut_limestone(name='Fine-cut limestone'):
    material, nodes, links, shader, uv = _base(name)
    brick = nodes.new('ShaderNodeTexBrick')
    links.new(uv, brick.inputs['Vector'])
    for key, value in [('Scale',2),('Mortar Size',.009),('Mortar Smooth',.004),('Brick Width',.5),('Row Height',.25)]:
        brick.inputs[key].default_value = value
    brick.inputs['Color1'].default_value = (.52,.46,.35,1)
    brick.inputs['Color2'].default_value = (.62,.56,.44,1)
    brick.inputs['Mortar'].default_value = (.35,.32,.27,1)
    grain = _seamless_noise(nodes, links, uv, 35, 35)
    variation = _ramp(nodes, links, grain, (.80,.80,.80), (1,1,1))
    multiply = nodes.new('ShaderNodeMixRGB')
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = .65
    links.new(brick.outputs['Color'], multiply.inputs[1])
    links.new(variation, multiply.inputs[2])
    links.new(multiply.outputs[0], shader.inputs['Base Color'])
    links.new(_ramp(nodes,links,grain,(.74,.74,.74),(.88,.88,.88)),shader.inputs['Roughness'])
    joint = nodes.new('ShaderNodeBump')
    joint.invert = True
    joint.inputs['Strength'].default_value = .5
    joint.inputs['Distance'].default_value = .003
    links.new(brick.outputs['Fac'],joint.inputs['Height'])
    pores = nodes.new('ShaderNodeBump')
    pores.inputs['Strength'].default_value = .25
    pores.inputs['Distance'].default_value = .0008
    links.new(joint.outputs['Normal'],pores.inputs['Normal'])
    links.new(grain,pores.inputs['Height'])
    links.new(pores.outputs['Normal'],shader.inputs['Normal'])
    return material


def weathered_boards(name='Weathered oak boards'):
    material, nodes, links, shader, uv = _base(name)
    grain = _seamless_noise(nodes,links,uv,.6,22)
    wood = _ramp(nodes,links,grain,(.115,.072,.037),(.29,.205,.12))
    brick = nodes.new('ShaderNodeTexBrick')
    links.new(uv,brick.inputs['Vector'])
    for key,value in [('Scale',2),('Mortar Size',.003),('Mortar Smooth',.001),('Brick Width',2),('Row Height',.125)]:
        brick.inputs[key].default_value = value
    brick.inputs['Color1'].default_value = (.8,.8,.8,1)
    brick.inputs['Color2'].default_value = (1,1,1,1)
    brick.inputs['Mortar'].default_value = (.24,.24,.24,1)
    multiply = nodes.new('ShaderNodeMixRGB')
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs[0].default_value = 1
    links.new(wood,multiply.inputs[1])
    links.new(brick.outputs['Color'],multiply.inputs[2])
    links.new(multiply.outputs[0],shader.inputs['Base Color'])
    links.new(_ramp(nodes,links,grain,(.55,.55,.55),(.76,.76,.76)),shader.inputs['Roughness'])
    bump = nodes.new('ShaderNodeBump')
    bump.invert = True
    bump.inputs['Distance'].default_value = .002
    bump.inputs['Strength'].default_value = .4
    links.new(brick.outputs['Fac'],bump.inputs['Height'])
    fine = nodes.new('ShaderNodeBump')
    fine.inputs['Distance'].default_value = .0005
    fine.inputs['Strength'].default_value = .3
    links.new(bump.outputs['Normal'],fine.inputs['Normal'])
    links.new(grain,fine.inputs['Height'])
    links.new(fine.outputs['Normal'],shader.inputs['Normal'])
    return material


def slate_tiles(name='Blue-grey slate tiles'):
    material, nodes, links, shader, uv = _base(name)
    brick = nodes.new('ShaderNodeTexBrick')
    links.new(uv,brick.inputs['Vector'])
    for key,value in [('Scale',2),('Mortar Size',.007),('Mortar Smooth',.002),('Brick Width',1/3),('Row Height',.25)]:
        brick.inputs[key].default_value = value
    brick.inputs['Color1'].default_value = (.045,.06,.074,1)
    brick.inputs['Color2'].default_value = (.09,.105,.115,1)
    brick.inputs['Mortar'].default_value = (.02,.025,.03,1)
    links.new(brick.outputs['Color'],shader.inputs['Base Color'])
    grain = _seamless_noise(nodes,links,uv,25,25)
    links.new(_ramp(nodes,links,grain,(.55,.55,.55),(.8,.8,.8)),shader.inputs['Roughness'])
    bump = nodes.new('ShaderNodeBump')
    bump.invert = True
    bump.inputs['Distance'].default_value = .004
    bump.inputs['Strength'].default_value = .5
    links.new(brick.outputs['Fac'],bump.inputs['Height'])
    links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    return material
