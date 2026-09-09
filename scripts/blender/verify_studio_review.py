"""Verify inspection framing and complete camera/settings restoration in Blender 4.5."""
from pathlib import Path
import sys
import tempfile
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from cloud.blender_billing.review import render_view_code

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
collection=bpy.data.collections.new('AGARTHA_MODEL');bpy.context.scene.collection.children.link(collection)
bpy.ops.mesh.primitive_cube_add(location=(2,-3,1))
model=bpy.context.object;model.name='LongBody';model.scale=(.5,4,1)
for owner in list(model.users_collection):owner.objects.unlink(model)
collection.objects.link(model)
modifier=model.modifiers.new('Repeated structure','ARRAY');modifier.count=3;modifier.relative_offset_displace=(2.4,0,0)
bpy.ops.object.camera_add(location=(12,-15,9))
source=bpy.context.object;source.rotation_mode='QUATERNION';source.rotation_quaternion=(Vector((2,-3,1))-source.location).to_track_quat('-Z','Y')
scene=bpy.context.scene;scene.camera=source
scene.render.engine='CYCLES';scene.cycles.samples=7;scene.cycles.time_limit=2.2;scene.cycles.adaptive_threshold=.12
scene.render.resolution_x=321;scene.render.resolution_y=234;scene.render.pixel_aspect_x=2;scene.render.pixel_aspect_y=1
scene.render.use_border=True;scene.render.use_crop_to_border=True;scene.render.filepath='unchanged.png';scene.render.threads_mode='FIXED';scene.render.threads=3
scene.render.image_settings.file_format='JPEG'
render_keys=('engine','threads_mode','threads','filepath','resolution_x','resolution_y','resolution_percentage','pixel_aspect_x','pixel_aspect_y','use_border','use_crop_to_border')
cycle_keys=('device','samples','time_limit','use_denoising','use_adaptive_sampling','adaptive_threshold','adaptive_min_samples','denoiser','denoising_input_passes','denoising_prefilter')

def state():return ({key:getattr(scene.render,key) for key in render_keys},{key:getattr(scene.cycles,key) for key in cycle_keys},scene.render.image_settings.file_format,source.matrix_world.copy(),len(bpy.data.cameras))
checks=[]
def verify_frame():
    bpy.context.view_layer.update()
    obj=model.evaluated_get(bpy.context.evaluated_depsgraph_get())
    for corner in obj.bound_box:
        uv=world_to_camera_view(scene,scene.camera,obj.matrix_world @ Vector(corner))
        assert .04 <= uv.x <= .96 and .04 <= uv.y <= .96 and uv.z>0,(uv[:],scene.camera.data.type)
    checks.append(scene.camera.name)

with tempfile.TemporaryDirectory() as directory:
    for camera_type in ('PERSP','ORTHO'):
        source.data.type=camera_type;source.data.shift_x=.3;source.data.shift_y=-.2;source.data.dof.use_dof=True
        bpy.context.view_layer.update();before=state()
        for view in ('hero','front','right','back','detail'):
            code=render_view_code(view,'LongBody').replace('/workspace/artifacts',directory).replace('bpy.ops.render.render(write_still=True)','verify_frame()')
            exec(code,globals())
            assert scene.camera==source and state()==before,'Inspection changed the saved hero state.'
        code=render_view_code('front').replace('/workspace/artifacts',directory).replace('bpy.ops.render.render(write_still=True)',"raise RuntimeError('simulated render failure')")
        try:exec(code,globals())
        except RuntimeError:pass
        else:raise AssertionError('Expected render error')
        assert scene.camera==source and state()==before,'Failure did not restore the camera/settings.'
print('STUDIO_REVIEW_OK '+str(len(checks))+' fitted views; success and failure restore original settings.')
