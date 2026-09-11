"""Real Blender regression: managed exports must carry procedural surface maps."""
import ast
import json
from pathlib import Path
import struct
import sys
import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / 'scripts/blender')]
from baking import procedural_material

output = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
output.mkdir(parents=True, exist_ok=True)
module = ast.parse((ROOT / 'cloud/blender_billing/managed.py').read_text())
assignment = next(node for node in module.body if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'EXPORT_CODE' for t in node.targets))
from cloud.blender_billing.export_materials import EXPORT_MATERIALS_CODE
code = eval(compile(ast.Expression(assignment.value), '<managed export>', 'eval'), {'EXPORT_MATERIALS_CODE': EXPORT_MATERIALS_CODE})
code = code.replace('/workspace/artifacts', str(output))
bpy.ops.wm.read_factory_settings(use_empty=True)
model = bpy.data.collections.new('AGARTHA_MODEL')
bpy.context.scene.collection.children.link(model)
bpy.ops.mesh.primitive_cube_add()
body = bpy.context.object
body.name = 'Procedural wood'
for owner in list(body.users_collection): owner.objects.unlink(body)
model.objects.link(body)
material = procedural_material('Walnut', 'wood', scale=3)
body.data.materials.append(material)
shader = material.node_tree.nodes['Principled BSDF']
shader.inputs['Sheen Weight'].default_value = .35
shader.inputs['Sheen Roughness'].default_value = .6
shader.inputs['Sheen Tint'].default_value = (.18, .07, .02, 1)
source_sheen = tuple(shader.inputs[key].default_value if key != 'Sheen Tint' else tuple(shader.inputs[key].default_value) for key in ('Sheen Weight', 'Sheen Roughness', 'Sheen Tint'))
bevel = body.modifiers.new('Preserve source bevel', 'BEVEL')
bevel.width, bevel.segments = .15, 2
bpy.ops.object.camera_add(location=(4, -6, 4))
bpy.context.scene.camera = bpy.context.object
bpy.context.object.rotation_euler = (-bpy.context.object.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.light_add(type='AREA', location=(1, -3, 5))
bpy.context.object.data.energy = 1000
before = (body.data, body.data.materials[0], len(material.node_tree.nodes), len(bpy.data.objects), len(bpy.data.meshes), len(bpy.data.materials), len([image for image in bpy.data.images if image.type not in {'RENDER_RESULT', 'COMPOSITING'}]))
exec(code, {})
data = (output / 'model.glb').read_bytes()
doc = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
assert any(m.get('pbrMetallicRoughness', {}).get('baseColorTexture') for m in doc.get('materials', [])), 'Managed export silently lost procedural wood color'
assert doc.get('images') and all('bufferView' in image for image in doc['images']), 'Textures must be embedded in GLB'
sheen = next(m['extensions']['KHR_materials_sheen'] for m in doc['materials'] if 'KHR_materials_sheen' in m.get('extensions', {}))
assert abs(sheen['sheenColorFactor'][0] - .18) < .001 and abs(sheen['sheenRoughnessFactor'] - .6) < .001, 'Export lost supported cloth sheen'
assert source_sheen == tuple(shader.inputs[key].default_value if key != 'Sheen Tint' else tuple(shader.inputs[key].default_value) for key in ('Sheen Weight', 'Sheen Roughness', 'Sheen Tint'))
assert body.modifiers.get(bevel.name) and len(body.data.polygons) == 6, 'Baking applied source modifiers'
assert before == (body.data, body.data.materials[0], len(material.node_tree.nodes), len(bpy.data.objects), len(bpy.data.meshes), len(bpy.data.materials), len([image for image in bpy.data.images if image.type not in {'RENDER_RESULT', 'COMPOSITING'}])), 'Export mutated source or leaked disposable bake data'
print('MANAGED_MATERIAL_EXPORT_OK: embedded surface textures; editable source preserved')

# Decode the actual embedded albedo, rather than merely trusting a texture entry.
pbr = next(m['pbrMetallicRoughness'] for m in doc['materials'] if m.get('pbrMetallicRoughness', {}).get('baseColorTexture'))
image_index = doc['textures'][pbr['baseColorTexture']['index']]['source']
view = doc['bufferViews'][doc['images'][image_index]['bufferView']]
bin_start = 20 + struct.unpack_from('<I', data, 12)[0] + 8
pixels_path = output / 'embedded-base-color.png'
pixels_path.write_bytes(data[bin_start + view.get('byteOffset', 0):bin_start + view.get('byteOffset', 0) + view['byteLength']])
image = bpy.data.images.load(str(pixels_path), check_existing=False)
values = image.pixels[:]
assert max(values[0::4]) - min(values[0::4]) > .1, 'Exported texture lost wood grain variation'
assert sum(values[0::4]) > sum(values[2::4]) * 1.5, 'Exported wood is white or the wrong color'
bpy.data.images.remove(image)

# Fail after one successful bake. No partially prepared runtime data may leak,
# and the previously accepted GLB must remain intact.
import baking
scope = {}
exec(EXPORT_MATERIALS_CODE, scope)
export = scope['_agartha_export_glb']
second = body.copy()
second.data = body.data.copy()
model.objects.link(second)
second.location.x = 3
snap = lambda: {name: set(getattr(bpy.data, name)) for name in ('objects', 'meshes', 'materials', 'images')}
state = snap()
accepted = (output / 'model.glb').read_bytes()
original_bake = baking.bake_materials
calls = 0

def failing_bake(*args, **kwargs):
    global calls
    calls += 1
    if calls == 2:
        raise RuntimeError('injected second bake failure')
    return original_bake(*args, **kwargs)

baking.bake_materials = failing_bake
try:
    export([body, second], str(output / 'model.glb'))
except RuntimeError as error:
    assert 'injected' in str(error)
else:
    raise AssertionError('Bake failure was swallowed')
finally:
    baking.bake_materials = original_bake
assert snap() == state, 'Failed export leaked disposable bake data'
assert (output / 'model.glb').read_bytes() == accepted, 'Failed bake replaced accepted GLB'
assert not (output / 'model.glb.pending.glb').exists()

# Unsupported extra shader features must produce a repairable error, not a
# silently flattened approximation. The same features on plain PBR remain valid.
material.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = .2
try:
    export([body], str(output / 'model.glb'))
except ValueError as error:
    assert 'Cannot preserve material' in str(error) and 'Coat Weight' in str(error)
else:
    raise AssertionError('Unsupported procedural shader was silently exported')
assert (output / 'model.glb').read_bytes() == accepted
assert snap() == state
print('MANAGED_MATERIAL_FAILURE_OK: failed baking preserves accepted GLB and source data')

# Bound automatic work before the first bake, and explain mixed-material repairs.
shader.inputs['Coat Weight'].default_value = 0
copies = [body, second]
for index in range(15):
    copy = body.copy()
    model.objects.link(copy)
    copies.append(copy)
state = snap()
try:
    export(copies, str(output / 'model.glb'))
except ValueError as error:
    assert 'at most 16' in str(error)
else:
    raise AssertionError('Automatic bake budget was not enforced')
assert snap() == state and (output / 'model.glb').read_bytes() == accepted
plain = bpy.data.materials.new('Portable solid blue')
plain.use_nodes = True
plain.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.02, .05, .8, 1)
second.data.materials.append(plain)
second.data.polygons[0].material_index = 1
state = snap()
try:
    export([second], str(output / 'model.glb'))
except ValueError as error:
    assert 'single-material' in str(error)
else:
    raise AssertionError('Mixed procedural material regions were silently flattened')
assert snap() == state and (output / 'model.glb').read_bytes() == accepted

# Already-portable image materials must bypass baking and retain their image.
second.data.materials.clear()
second.data.materials.append(plain)
for polygon in second.data.polygons:
    polygon.material_index = 0
image = bpy.data.images.new('Portable bitmap', width=2, height=2)
image.pixels[:] = [.04, .1, .8, 1] * 4
image.pack()
texture = plain.node_tree.nodes.new('ShaderNodeTexImage')
texture.image = image
plain.node_tree.links.new(texture.outputs['Color'], plain.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
state = snap()
baking.bake_materials = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError('Portable PBR was needlessly baked'))
try:
    export([second], str(output / 'portable.glb'))
finally:
    baking.bake_materials = original_bake
assert snap() == state
portable = (output / 'portable.glb').read_bytes()
portable_doc = json.loads(portable[20:20 + struct.unpack_from('<I', portable, 12)[0]])
assert len(portable_doc['images']) == 1
assert portable_doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']
print('MANAGED_MATERIAL_BOUNDS_OK: bounded work, mixed-material repair and portable-texture passthrough')
