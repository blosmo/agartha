"""Service-owned material preparation, sent with each managed export operation."""

EXPORT_MATERIALS_CODE = r'''
def _agartha_export_glb(objects, path):
    import bpy, os, sys
    # This baker is already installed in the pinned Blender worker.
    if '/opt/agartha/toolkit' not in sys.path:
        sys.path.append('/opt/agartha/toolkit')
    from baking import bake_materials, _principled_material, BakingError

    def procedural(material):
        if not material or not material.use_nodes:
            return False
        outputs = [node for node in material.node_tree.nodes
                   if node.type == 'OUTPUT_MATERIAL' and node.is_active_output]
        pending, visited = list(outputs), set()
        while pending:
            node = pending.pop()
            if node in visited:
                continue
            visited.add(node)
            if node.type in {'VALTORGB', 'BUMP'} or (node.type.startswith('TEX_') and node.type not in {'TEX_IMAGE', 'TEX_COORD'}):
                return True
            pending.extend(link.from_node for socket in node.inputs for link in socket.links)
        return False

    context = bpy.context.scene
    selected, active = list(bpy.context.selected_objects), bpy.context.view_layer.objects.active
    threads = (context.render.threads_mode, context.render.threads)
    groups = ('objects', 'meshes', 'materials', 'images')
    before = {name: set(getattr(bpy.data, name)) for name in groups}
    temporary_path = path + '.pending.glb'
    try:
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        needs_bake, materials_for_baking = {}, {}
        defaults = None
        # Validate every material before baking. Preserve constant cloth sheen
        # separately: glTF carries it as KHR_materials_sheen, not in the PBR maps.
        for obj in objects:
            evaluated = obj.evaluated_get(depsgraph)
            slots = [slot.material for slot in evaluated.material_slots]
            used = {polygon.material_index for polygon in evaluated.data.polygons}
            materials = {slots[index].original for index in used
                         if index < len(slots) and slots[index] is not None}
            if not any(procedural(material) for material in materials):
                continue
            try:
                if len(materials) != 1 or any(index >= len(slots) or slots[index] is None for index in used):
                    raise BakingError('Separate procedural material regions into single-material meshes before exporting')
                material = next(iter(materials))
                if material not in materials_for_baking:
                    normalized = material.copy()
                    outputs = [node for node in normalized.node_tree.nodes if node.type == 'OUTPUT_MATERIAL']
                    surface = outputs[0].inputs['Surface'] if len(outputs) == 1 else None
                    shader = surface.links[0].from_node if surface and surface.is_linked else None
                    sheen = {}
                    if shader and shader.type == 'BSDF_PRINCIPLED':
                        if defaults is None:
                            defaults = bpy.data.materials.new('Export shader defaults')
                            defaults.use_nodes = True
                        reference = defaults.node_tree.nodes.get('Principled BSDF')
                        for key in ('Sheen Weight', 'Sheen Roughness', 'Sheen Tint'):
                            socket = shader.inputs[key]
                            if socket.is_linked:
                                raise BakingError('Bake procedural sheen explicitly before exporting')
                            value = socket.default_value
                            sheen[key] = value if isinstance(value, (int, float)) else tuple(value)
                            socket.default_value = reference.inputs[key].default_value
                    _principled_material(normalized)
                    materials_for_baking[material] = (normalized, sheen)
                needs_bake[obj] = materials_for_baking[material]
            except BakingError as error:
                raise ValueError('Cannot preserve material on ' + obj.name + ': ' + str(error)) from error
        if len(needs_bake) > 16:
            raise ValueError('Export supports at most 16 automatic procedural mesh bakes; pre-bake or simplify the remaining meshes')

        context.render.threads_mode, context.render.threads = 'FIXED', 2
        prepared = []
        for obj in objects:
            if obj not in needs_bake:
                prepared.append(obj)
                continue
            normalized, sheen = needs_bake[obj]
            # Freeze evaluated geometry on a disposable input, including Geometry
            # Nodes and object-linked material overrides. Never reassign source slots.
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
            mesh.materials.clear()
            mesh.materials.append(normalized)
            for polygon in mesh.polygons:
                polygon.material_index = 0
            source = bpy.data.objects.new(obj.name + '_export_source', mesh)
            context.collection.objects.link(source)
            source.matrix_world = obj.matrix_world.copy()
            baked = bake_materials(source, resolution=512, samples=4)
            shader = baked.data.materials[0].node_tree.nodes.get('Principled BSDF')
            for key, value in sheen.items():
                shader.inputs[key].default_value = value
            prepared.append(baked)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in prepared:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = prepared[0]
        result = bpy.ops.export_scene.gltf(filepath=temporary_path, export_format='GLB', use_selection=True, export_apply=True, export_cameras=False, export_lights=False)
        if 'FINISHED' not in result:
            raise ValueError('GLB export did not finish; the previous artifact was preserved')
        os.replace(temporary_path, path)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)
        # Only data allocated by this export is disposable. Preserve the source
        # meshes, modifiers, procedural node graphs and the current selection.
        for name in groups:
            blocks = getattr(bpy.data, name)
            for block in set(blocks) - before[name]:
                blocks.remove(block, do_unlink=True)
        context.render.threads_mode, context.render.threads = threads
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active
'''
