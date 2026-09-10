"""Blender-backed checks for the bounded template interpreter and chair fixture."""
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from cloud.blender_mcp.asset_templates import build_template

bpy.ops.wm.read_factory_settings(use_empty=True)
definition = json.loads((ROOT / "scripts/showcase/chair-template.json").read_text())
first = build_template(definition, {"back_style": "slatted", "upholstery": "seat-and-back"}, template_id="template-" + "a" * 64)
assert first.get("agarthaTemplateId") == "template-" + "a" * 64
assert json.loads(first["agarthaTemplateDefinition"])["name"] == definition["name"]
parts_first = len(first.children)
first_dims = tuple(round(v, 4) for v in first.dimensions)

second = build_template(definition, {"back_style": "solid", "arms": False, "finish": "ivory"}, name="Canonical Chair Solid")
assert len(second.children) != parts_first
assert len(second.children)>0
assert all(o.type=='MESH' for o in second.children)
assert json.loads(second["agarthaTemplateParameters"])["finish"] == "ivory"

bad = dict(definition)
bad["parts"] = [{"kind": "box", "position": [0, 0, 0], "size": [-1, 1, 1], "material": "wood"}]
before = set(bpy.data.objects)
try:
    build_template(bad)
except ValueError:
    pass
else:
    raise AssertionError("Invalid geometry accepted")
assert set(bpy.data.objects) == before
# Repeated preparation/export must preserve packed maps, not unpack them.
import tempfile,struct
from cloud.blender_mcp.components import export_component
from cloud.blender_mcp.material_authoring import _prepare_source
for obj in first.children:
 for mat in obj.data.materials:
  _prepare_source(mat);_prepare_source(mat)
  for node in mat.node_tree.nodes:
   if node.type=='TEX_IMAGE': assert node.image.packed_file is not None and node.image.has_data
paths=export_component(first,tempfile.mkdtemp(prefix='agartha-template-export-'))
raw=Path(paths['glb']).read_bytes();n=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+n])
assert len(gltf.get('images',[]))>=3
assert all('bufferView' in image for image in gltf['images'])
print("ASSET_TEMPLATE_CHECK_PASSED", first.name, second.name, parts_first)
