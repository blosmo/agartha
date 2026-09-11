"""Run a real Blender round-trip for generated textured, rigged components.

This is intentionally a focused executable check rather than a pytest test: it
requires Blender's bundled ``bpy`` runtime and does not call any provider.
"""
from __future__ import annotations

import json
import sys
import tempfile
import ast
from pathlib import Path

import bpy

REPOSITORY = Path(__file__).resolve().parents[2]
if str(REPOSITORY) not in sys.path:
    sys.path.insert(0, str(REPOSITORY))

from cloud.blender_mcp.generated_components import import_generated_component


def managed_export_code() -> str:
    """Read the production export string without importing service-only deps."""
    source = (REPOSITORY / "cloud/blender_billing/managed.py").read_text()
    module = ast.parse(source)
    assignment = next(
        node for node in module.body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "EXPORT_CODE" for target in node.targets)
    )
    value = ast.literal_eval(assignment.value)
    assert isinstance(value, str)
    return value


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection" and collection.users == 0:
            bpy.data.collections.remove(collection)


def textured_rig() -> tuple[bpy.types.Object, bpy.types.Object, bpy.types.Object]:
    source = bpy.data.collections.new("FixtureSource")
    bpy.context.scene.collection.children.link(source)
    model = bpy.data.collections.new("FixtureModel")
    source.children.link(model)
    bpy.ops.mesh.primitive_cube_add(size=0.25, location=(20, 20, 20))
    excluded = bpy.context.object
    excluded.name = "ExcludedSourceObject"
    for collection in list(excluded.users_collection):
        collection.objects.unlink(excluded)
    source.objects.link(excluded)

    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1))
    mesh = bpy.context.object
    mesh.name = "TexturedBody"
    for collection in list(mesh.users_collection):
        collection.objects.unlink(mesh)
    model.objects.link(mesh)
    # A packed image makes the texture preservation assertion independent of
    # any filesystem path or external asset service.
    image = bpy.data.images.new("FixtureTexture", width=2, height=2)
    image.pixels = [1, 0.15, 0.05, 1] * 4
    image.pack()
    material = bpy.data.materials.new("FixtureMaterial")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    links.new(texture.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    mesh.data.materials.append(material)

    armature_data = bpy.data.armatures.new("FixtureSkeleton")
    armature = bpy.data.objects.new("FixtureSkeleton", armature_data)
    model.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bone = armature_data.edit_bones.new("root")
    bone.head = (0, 0, 0)
    bone.tail = (0, 0, 2)
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.location = (0, 0, 1)
    mesh.parent = armature
    group = mesh.vertex_groups.new(name="root")
    group.add(list(range(len(mesh.data.vertices))), 1.0, "REPLACE")
    modifier = mesh.modifiers.new("FixtureSkin", "ARMATURE")
    modifier.object = armature
    mesh.shape_key_add(name="Basis")
    expression = mesh.shape_key_add(name="FixtureExpression")
    expression.data[0].co.x += 0.15
    mesh.modifiers.new("FixtureBevel", "BEVEL").width = 0.04

    action = bpy.data.actions.new("FixtureWalk")
    armature.animation_data_create()
    armature.animation_data.action = action
    # keyframe_insert works across Blender 4.x and the layered Action API in
    # Blender 5.x, whereas Action.fcurves was removed in the latter.
    bpy.context.scene.frame_set(1)
    armature.rotation_euler[2] = 0.0
    armature.keyframe_insert(data_path="rotation_euler", index=2)
    bpy.context.scene.frame_set(12)
    armature.rotation_euler[2] = 0.35
    armature.keyframe_insert(data_path="rotation_euler", index=2)
    action.frame_start, action.frame_end = 1, 12

    root = bpy.data.objects.new("FixtureParent", None)
    model.objects.link(root)
    root.location = (1.5, -0.5, 0.25)
    root.rotation_euler[2] = 0.2
    armature.parent = root
    return root, mesh, armature


def export_fixture(path: Path, root: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    model = root.users_collection[0]
    for obj in model.all_objects:
        obj.select_set(obj.type in {"MESH", "ARMATURE", "EMPTY"})
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_cameras=False,
        export_lights=False,
    )


def glb_json(path: Path) -> dict:
    payload = path.read_bytes()
    assert payload[:4] == b"glTF", "fixture did not produce a GLB"
    length = int.from_bytes(payload[12:16], "little")
    return json.loads(payload[20 : 20 + length])


def imported_objects(root: bpy.types.Object) -> list[bpy.types.Object]:
    return [obj for obj in root.children_recursive]


def main() -> None:
    clear_scene()
    with tempfile.TemporaryDirectory(prefix="agartha-glb-verify-") as directory:
        directory = Path(directory)
        fixture = directory / "fixture.glb"
        root, mesh, armature = textured_rig()
        export_fixture(fixture, root)
        document = glb_json(fixture)
        assert document.get("skins"), "fixture GLB lost its skin"
        assert document.get("animations"), "fixture GLB lost its animation"
        assert document.get("images") and all("uri" not in item for item in document["images"]), "texture was not embedded"
        assert any(primitive.get("targets") for mesh in document.get("meshes", []) for primitive in mesh.get("primitives", [])), "fixture GLB lost shape-key targets"

        imported = import_generated_component(
            fixture,
            "GeneratedCharacter",
            task_id="fixture-task-1",
            location=(3, 2, 0.5),
            rotation=(0, 0, 0.1),
            scale=(1.25, 1.25, 1.25),
            rigged=True,
        )
        object_count = len(bpy.data.objects)
        assert import_generated_component(
            fixture,
            "GeneratedCharacter",
            task_id="fixture-task-1",
            location=(99, 99, 99),
            rigged=True,
        ) is imported
        assert len(bpy.data.objects) == object_count, "idempotent generated import created duplicate objects"
        try:
            import_generated_component(fixture, "GeneratedCharacter", task_id="other-task", rigged=True)
        except ValueError:
            pass
        else:
            raise AssertionError("same component name with another task was accepted")
        imported["agarthaGeneratedReady"] = False
        try:
            import_generated_component(fixture, "GeneratedCharacter", task_id="fixture-task-1", rigged=True)
        except ValueError:
            pass
        else:
            raise AssertionError("partial generated component was accepted as ready")
        imported["agarthaGeneratedReady"] = True
        parts = imported_objects(imported)
        assert any(obj.type == "MESH" for obj in parts)
        imported_armature = next(obj for obj in parts if obj.type == "ARMATURE")
        imported_mesh = next(obj for obj in parts if obj.type == "MESH")
        assert imported_armature.parent is imported or imported_armature.parent in parts
        assert imported_mesh.parent is imported_armature or imported_mesh.parent in parts
        assert imported_mesh.data.materials and imported_mesh.data.materials[0].node_tree.nodes.get("Image Texture")
        assert imported_mesh.modifiers.get("FixtureSkin") or any(mod.type == "ARMATURE" for mod in imported_mesh.modifiers)
        assert imported_armature.animation_data and imported_armature.animation_data.action
        assert tuple(round(value, 3) for value in imported.location) == (3, 2, 0.5)

        model = bpy.data.collections.get("AGARTHA_MODEL")
        assert model and imported.name in model.objects
        camera_data = bpy.data.cameras.new("FixtureCamera")
        camera = bpy.data.objects.new("FixtureCamera", camera_data)
        bpy.context.scene.collection.objects.link(camera)
        bpy.context.scene.camera = camera
        artifacts = directory / "artifacts"
        artifacts.mkdir()
        # Exercise the exact managed export snippet, with its artifact root
        # redirected to this temporary directory.
        exec(managed_export_code().replace("/workspace/artifacts", str(artifacts)), {"__name__": "__main__"})
        exported = artifacts / "model.glb"
        final_document = glb_json(exported)
        node_names = {node.get("name") for node in final_document.get("nodes", [])}
        assert "ExcludedSourceObject" not in node_names, "managed export included a source object outside AGARTHA_MODEL"
        assert final_document.get("skins"), "managed export lost the skeleton"
        assert final_document.get("animations"), "managed export lost animation"
        assert final_document.get("images") and all("uri" not in item for item in final_document["images"]), "managed export lost embedded texture"
        assert any(primitive.get("targets") for mesh in final_document.get("meshes", []) for primitive in mesh.get("primitives", [])), "managed export lost shape-key targets"

    print("GENERATED_COMPONENTS_BLENDER_ROUNDTRIP_OK")


if __name__ == "__main__":
    main()
