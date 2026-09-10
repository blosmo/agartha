"""Create a local source/GLB/preview demonstrating the Blender 5.2 toolkits."""
from pathlib import Path
import json
import runpy
import sys
import bpy

ROOT = Path(__file__).resolve().parents[2]
output = Path(sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else '/tmp/agartha-advanced-demo').resolve()
output.mkdir(parents=True, exist_ok=True)
advanced = runpy.run_path(str(ROOT/'scripts/blender/advanced_kit.py'))
baking = runpy.run_path(str(ROOT/'scripts/blender/baking.py'))
kit = runpy.run_path(str(ROOT/'scripts/seed/starter_kit.py'))
kit['reset_scene']('Blender 5.2 toolkit demonstration')
stone = baking['procedural_material']('Warm stone', preset='stone', scale=5, seed=3)
wood = baking['procedural_material']('Wood grain', preset='wood', scale=2)
arch = advanced['create_arch']('Editable arch', loc=(-2,0,-.7), material=stone, width=3, height=3.5)
stairs = advanced['create_stairs']('Editable stairs', loc=(1.8,0,-1.3), material=wood, steps=7, width=1.8)
for source, name in ((arch,'deliver_arch'),(stairs,'deliver_stairs')):
    baked = baking['bake_materials'](source, resolution=256, samples=4)
    baked.name = name
    source.hide_render = True
    source.hide_set(True)
advanced['create_column']('deliver_column', loc=(1.8,0,-2.5), height=2.8, radius=.45)
advanced['create_rock_cluster']('deliver_rocks', loc=(-2.4,0,1.7), radius=.65, seed=17)
platform = kit['cube']('deliver_platform',(0,-.18,0),(8,.36,6),kit['material']('Sandstone','#c6bda6'))
advanced['add_mesh_bevel'](platform,width=.06,segments=3)
bpy.ops.wm.save_as_mainfile(filepath=str(output/'advanced-editable.blend'))
metrics = kit['export_runtime'](str(output/'advanced.glb'), prefix='deliver_')
preview = kit['render_preview'](str(output/'advanced.png'),prefix='deliver_',quality='final')
(output/'metrics.json').write_text(json.dumps({'export':metrics,'preview':preview},indent=2))
print('ADVANCED_DEMO',json.dumps({'triangles':metrics['triangles'],'glbBytes':metrics['bytes'],'output':str(output)}))
