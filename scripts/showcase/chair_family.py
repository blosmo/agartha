"""Render diverse chairs from one shared declarative template, entirely locally."""
from pathlib import Path
import bpy,json,sys,hashlib
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(Path(__file__).parent))
from cloud.blender_mcp.asset_templates import build_template
from cloud.blender_mcp.components import export_component,assembly_manifest
from scripts.seed import starter_kit as kit
# build_models is importable here: the selected slug is chair-family, so its scene loop does not run.
from build_models import setup,presentation,box,material
args=sys.argv[sys.argv.index('--')+1:];out=Path(args[0])/'chair-family';out.mkdir(parents=True,exist_ok=True)
definition=json.loads((ROOT/'scripts/showcase/chair-template.json').read_text())
template_id=json.loads((ROOT/'scripts/showcase/chair-template-provenance.json').read_text())['id']
setup('One chair, many possibilities')
choices=[
 ('Oak spindle',{'finish':'oak','back_style':'spindle','upholstery':'none','arms':False}),
 ('Walnut linen',{'finish':'walnut','back_style':'slatted','upholstery':'seat','fabric':'linen','seat_color':'#bcb295','arms':False}),
 ('Emerald lounge',{'finish':'walnut','back_style':'solid','upholstery':'seat-and-back','fabric':'velvet','seat_color':'#285b4b','back_color':'#285b4b','arms':True,'seat_width':.7,'seat_depth':.64}),
 ('Ivory crossback',{'finish':'ivory','back_style':'crossed','upholstery':'none','arms':False,'leg_style':'straight'}),
 ('Cognac leather',{'finish':'walnut','back_style':'solid','upholstery':'seat-and-back','fabric':'leather','seat_color':'#a86637','back_color':'#a86637','arms':True}),
 ('Black spindle',{'finish':'black','back_style':'spindle','slat_count':7,'upholstery':'seat','fabric':'linen','seat_color':'#d0c6ad','arms':False,'back_height':.65}),
 ('Rose velvet',{'finish':'oak','back_style':'solid','upholstery':'seat-and-back','fabric':'velvet','seat_color':'#b06f6d','back_color':'#b06f6d','arms':False}),
 ('Olive lounge',{'finish':'black','back_style':'slatted','upholstery':'seat','fabric':'linen','seat_color':'#8c9667','arms':True,'seat_width':.68}),
 ('Tall oak',{'finish':'oak','back_style':'slatted','slat_count':4,'upholstery':'none','arms':False,'back_height':.72,'seat_width':.50}),
]
roots=[]
for index,(name,params) in enumerate(choices):
 root=build_template(definition,params,name=name,template_id=template_id)
 root.location=((index%3-1)*1.24,(index//3-1)*1.24,0);root.rotation_euler.z=-.16
 roots.append(root)
config={'title':'One chair, many possibilities','camera':(5,-8,6),'target':(0,0,.45),'size':5.2,'background':'#e9e7dc','world':.45,'key':'#fff0d8'}
scene=presentation(config);scene.render.resolution_x=1600;scene.render.resolution_y=1250;scene.cycles.samples=48
kit.export_runtime(str(out/'model.glb'),collection='AGARTHA_MODEL')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'model.blend'),check_existing=False)
scene.render.filepath=str(out/'preview.png');bpy.ops.render.render(write_still=True)
(out/'assembly.json').write_text(json.dumps(assembly_manifest(),indent=2))
(out/'template.json').write_text(json.dumps(definition,indent=2))
for root in roots[:3]:export_component(root,out/'variants'/root.name.lower().replace(' ','-'))
print('CHAIR_FAMILY_READY',str(out),flush=True)
