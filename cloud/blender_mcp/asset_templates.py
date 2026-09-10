"""Bounded, data-only procedural asset templates for Blender.

The template language is deliberately small: definitions are JSON data, never
Python snippets. Validation and expansion happen before any Blender datablock
is created so malformed recipes cannot leave a partial scene behind.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from typing import Any

MAX_JSON = 32 * 1024
MAX_PARAMS = 24
MAX_OPS = 128
MAX_DEPTH = 8
MAX_PRIMITIVES = 256
_PARAM_TYPES = {"number", "integer", "boolean", "enum", "color"}
_OPS = {"add", "sub", "mul", "div", "sin", "cos", "eq", "lt", "and", "or", "not", "min", "max"}
_GEOMETRY = {"box", "cylinder", "sphere", "beam"}
_TEXTURES = {"none", "wood", "linen", "velvet", "leather"}
_IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,39}$")
_BAKE_CACHE = {}


def _keys(value, allowed, label):
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    unknown = set(value) - set(allowed)
    if unknown:
        raise ValueError(f"Unknown {label} keys: {sorted(unknown)}")


def _finite(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be finite")
    return float(value)


def _expr(value, params, label="expression"):
    if isinstance(value, (str, bool, int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError(f"{label} must be finite")
        return value
    if not isinstance(value, dict):
        raise ValueError(f"Invalid {label}")
    if "param" in value:
        _keys(value, {"param"}, label)
        key = value["param"]
        if key not in params:
            raise ValueError(f"Unknown parameter {key}")
        return params[key]
    if "var" in value:
        _keys(value, {"var"}, label)
        raise ValueError(f"Unbound expression variable {value['var']}")
    if "op" in value:
        _keys(value, {"op", "args"}, label)
        op = value["op"]
        args = value.get("args")
        if op not in _OPS or not isinstance(args, list) or not args:
            raise ValueError(f"Invalid {label} operation")
        vals = [_expr(a, params, label) for a in args]
        if op == "not": return not bool(vals[0])
        if op == "and": return all(bool(v) for v in vals)
        if op == "or": return any(bool(v) for v in vals)
        if op == "eq": return vals[0] == vals[1] if len(vals) == 2 else False
        if op == "lt": return _finite(vals[0], label) < _finite(vals[1], label)
        nums = [_finite(v, label) for v in vals]
        if op == "add": return sum(nums)
        if op == "sub": return nums[0] - sum(nums[1:])
        if op == "mul": return math.prod(nums)
        if op == "div":
            if any(n == 0 for n in nums[1:]): raise ValueError("Division by zero")
            return nums[0] / math.prod(nums[1:])
        if op == "sin": return math.sin(nums[0])
        if op == "cos": return math.cos(nums[0])
        if op == "min": return min(nums)
        if op == "max": return max(nums)
    if "choose" in value:
        _keys(value, {"choose", "cases", "default"}, label)
        selector = _expr(value["choose"], params, label)
        cases = value["cases"]
        if not isinstance(cases, dict): raise ValueError(f"{label}.cases must be an object")
        selected = cases.get(str(selector), value.get("default"))
        if selected is None: raise ValueError(f"No choice for {selector}")
        return _expr(selected, params, label)
    raise ValueError(f"Invalid {label}")


def _resolve_parameters(definition, supplied):
    _keys(definition, {"version", "name", "description", "parameters", "materials", "parts"}, "definition")
    if definition.get("version") != 1 or not isinstance(definition.get("name"), str):
        raise ValueError("Definition requires version 1 and name")
    specs = definition.get("parameters")
    if not isinstance(specs, dict) or len(specs) > MAX_PARAMS: raise ValueError("Invalid parameters")
    supplied = {} if supplied is None else supplied
    if not isinstance(supplied,dict): raise ValueError("Parameters must be an object")
    if set(supplied) - set(specs): raise ValueError("Unknown supplied parameter")
    result = {}
    for key, spec in specs.items():
        if not _IDENTIFIER.fullmatch(key) or key in {"constructor", "prototype", "__proto__"}: raise ValueError(f"Invalid parameter name {key}")
        _keys(spec, {"type", "default", "min", "max", "values"}, f"parameter {key}")
        typ = spec.get("type")
        if typ not in _PARAM_TYPES or "default" not in spec: raise ValueError(f"Invalid parameter {key}")
        if typ in {"number", "integer"}:
            if "min" not in spec or "max" not in spec: raise ValueError("Numeric parameters need bounds")
            for bound in ("min", "max"):
                if bound in spec and abs(_finite(spec[bound], f"{key}.{bound}")) > 10000: raise ValueError(f"{key}.{bound} outside bounds")
            if "min" in spec and "max" in spec and spec["min"] > spec["max"]: raise ValueError(f"Invalid bounds for {key}")
        value = supplied.get(key, spec["default"])
        if typ == "boolean":
            if not isinstance(value, bool): raise ValueError(f"{key} must be boolean")
        elif typ == "integer":
            if isinstance(value, bool) or not isinstance(value, int): raise ValueError(f"{key} must be integer")
        elif typ == "number": _finite(value, key)
        elif typ == "enum":
            if not isinstance(spec.get("values"), list) or value not in spec["values"]: raise ValueError(f"Invalid {key}")
        elif typ == "color":
            if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value): raise ValueError(f"{key} must be #RRGGBB")
        if typ in {"number", "integer"}:
            if "min" in spec and value < spec["min"] or "max" in spec and value > spec["max"]: raise ValueError(f"{key} outside bounds")
        result[key] = value
    return result


def _expand(parts, params, depth=0, variables=None, stats=None):
    variables = variables or {}
    stats = stats or {"ops": 0, "primitives": 0}
    if depth > MAX_DEPTH: raise ValueError("Recipe nesting exceeds depth limit")
    expanded = []
    for raw in parts:
        stats["ops"] += 1
        if stats["ops"] > 4096: raise ValueError("Recipe operation limit exceeded")
        if not isinstance(raw, dict) or "kind" not in raw: raise ValueError("Invalid recipe operation")
        kind = raw["kind"]
        if kind == "repeat":
            _keys(raw, {"kind", "count", "var", "parts", "when"}, "repeat")
            count = _expr_with_vars(raw["count"], params, variables)
            if isinstance(count, bool) or int(count) != count or count < 0 or count > 32: raise ValueError("Invalid repeat count")
            if raw.get("when") is not None and not _expr_with_vars(raw["when"], params, variables): continue
            for i in range(int(count)):
                child_vars = dict(variables); child_vars[raw["var"]] = i
                expanded.extend(_expand(raw["parts"], params, depth + 1, child_vars, stats))
            continue
        if kind not in _GEOMETRY: raise ValueError(f"Unknown geometry kind {kind}")
        allowed = {"kind", "name", "position", "rotation", "material", "bevel", "when"}
        allowed |= {"size"} if kind == "box" else {"radius", "depth", "rotation"} if kind == "cylinder" else {"radius", "scale"} if kind == "sphere" else {"start", "end", "width"}
        _keys(raw, allowed, kind)
        if raw.get("when") is not None and not _expr_with_vars(raw["when"], params, variables): continue
        item = copy.deepcopy(raw)
        item.pop("when", None)
        item["_variables"] = dict(variables)
        for field in ("position", "size", "rotation", "scale", "start", "end"):
            if field in item: item[field] = [_expr_with_vars(v, params, variables) for v in item[field]]
        for field in ("radius", "depth", "width", "bevel"):
            if field in item: item[field] = _expr_with_vars(item[field], params, variables)
        stats["primitives"] += 1
        if stats["primitives"] > MAX_PRIMITIVES: raise ValueError("Expanded primitive limit exceeded")
        expanded.append(item)
    return expanded


def _expr_with_vars(value, params, variables):
    if isinstance(value, dict) and "var" in value:
        _keys(value, {"var"}, "expression")
        if value["var"] not in variables: raise ValueError("Unbound expression variable")
        return variables[value["var"]]
    if isinstance(value, dict) and "op" in value:
        value = dict(value); value["args"] = [_expr_with_vars(a, params, variables) for a in value.get("args", [])]
    if isinstance(value, dict) and "choose" in value:
        selector = _expr_with_vars(value["choose"], params, variables)
        cases = value.get("cases", {})
        selected = cases.get(str(selector), value.get("default"))
        if selected is None: raise ValueError(f"No choice for {selector}")
        return _expr_with_vars(selected, params, variables)
    return _expr(value, params)


def _material_color(value):
    if isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        vals = [int(value[i:i+2], 16) / 255 for i in (1, 3, 5)]
        return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in vals)
    raise ValueError("Material color must resolve to #RRGGBB")


def _texture_spec(spec, params):
    texture = spec.get("texture")
    if texture is None: return {"kind": "none", "scale": 1.0}
    _keys(texture, {"kind", "scale"}, "material texture")
    kind = _expr_with_vars(texture.get("kind", "none"), params, {})
    scale = _finite(_expr_with_vars(texture.get("scale", 1.0), params, {}), "texture scale")
    if kind not in _TEXTURES or scale <= 0: raise ValueError("Invalid material texture")
    return {"kind": kind, "scale": scale}


def _validate_expression_tree(value, params, variables, depth=0, state=None):
    state = state or {"nodes": 0}
    state["nodes"] += 1
    if state["nodes"] > 2048 or depth > MAX_DEPTH: raise ValueError("Expression budget exceeded")
    if isinstance(value,bool): return
    if isinstance(value,str):
        if len(value)>80: raise ValueError("Expression text too long")
        return
    if isinstance(value,(int,float)):
        if not math.isfinite(value) or abs(value)>10000: raise ValueError("Invalid expression number")
        return
    if not isinstance(value,dict): raise ValueError("Invalid expression")
    if isinstance(value, dict):
        if "param" in value:
            _keys(value, {"param"}, "expression")
            if value["param"] not in params: raise ValueError("Unknown parameter reference")
        elif "var" in value:
            _keys(value, {"var"}, "expression")
            if value["var"] not in variables: raise ValueError("Unbound expression variable")
        elif "op" in value:
            _keys(value, {"op", "args"}, "expression")
            args = value.get("args")
            if not isinstance(args, list) or not 1 <= len(args) <= 8: raise ValueError("Invalid expression arity")
            for arg in args: _validate_expression_tree(arg, params, variables, depth + 1, state)
        elif "choose" in value:
            _keys(value, {"choose", "cases", "default"}, "expression")
            cases = value.get("cases")
            if not isinstance(cases, dict) or len(cases) > 24: raise ValueError("Invalid expression choices")
            _validate_expression_tree(value["choose"], params, variables, depth + 1, state)
            for item in cases.values(): _validate_expression_tree(item, params, variables, depth + 1, state)
            if "default" not in value: raise ValueError("Choose requires default")
            _validate_expression_tree(value["default"], params, variables, depth + 1, state)
        else:
            raise ValueError("Invalid expression form")


def _validate_recipe(parts,parameters,materials,variables=None,depth=0,state=None):
    variables=variables or set()
    state=state if state is not None else {'parts':0,'nodes':0}
    if not isinstance(parts,list) or not parts or depth>MAX_DEPTH: raise ValueError('Invalid template parts')
    for part in parts:
        state['parts']+=1
        if state['parts']>MAX_OPS: raise ValueError('Recipe operation limit exceeded')
        if not isinstance(part,dict): raise ValueError('Invalid part')
        kind=part.get('kind')
        if 'when' in part:_validate_expression_tree(part['when'],parameters,variables,state=state)
        if kind=='repeat':
            _keys(part,{'kind','count','var','parts','when'},'repeat')
            variable=part.get('var')
            if not isinstance(variable,str) or not _IDENTIFIER.fullmatch(variable) or variable in variables: raise ValueError('Invalid repeat variable')
            _validate_expression_tree(part.get('count'),parameters,variables,state=state)
            _validate_recipe(part.get('parts'),parameters,materials,variables|{variable},depth+1,state)
            continue
        dimensions={'box':['size'],'cylinder':['radius','depth'],'sphere':['radius','scale'],'beam':['start','end','width']}.get(kind)
        if dimensions is None: raise ValueError('Unsupported geometry')
        _keys(part,{'kind','name','material','position','rotation','bevel','when',*dimensions},kind)
        if not isinstance(part.get('name'),str) or not part['name'] or len(part['name'])>80 or part.get('material') not in materials: raise ValueError('Invalid part name/material')
        for field in ['position','rotation',*dimensions]:
            if field not in part:
                if field in ['rotation','scale'] or kind=='beam' and field=='position':continue
                raise ValueError('Missing geometry field')
            if field in ['position','rotation','size','scale','start','end']:
                if not isinstance(part[field],list) or len(part[field])!=3: raise ValueError('Invalid geometry vector')
                for value in part[field]:_validate_expression_tree(value,parameters,variables,state=state)
            else:_validate_expression_tree(part[field],parameters,variables,state=state)
        if 'bevel' in part:_validate_expression_tree(part['bevel'],parameters,variables,state=state)


def _validate_expanded(expanded, materials):
    for item in expanded:
        if item.get("material") not in materials: raise ValueError("Unknown material slot")
        kind = item["kind"]
        vector_fields = {"box": ("position", "size"), "cylinder": ("position",), "sphere": ("position",), "beam": ("start", "end")}[kind]
        for field in vector_fields:
            value = item.get(field)
            if not isinstance(value, list) or len(value) != 3: raise ValueError(f"{kind}.{field} must be a 3-vector")
            for n in value:
                if abs(_finite(n,f"{kind}.{field}"))>10000: raise ValueError("Geometry exceeds bounds")
        if "rotation" in item:
            if not isinstance(item["rotation"], list) or len(item["rotation"]) != 3: raise ValueError("cylinder.rotation must be a 3-vector")
            for n in item["rotation"]: _finite(n, "cylinder.rotation")
        if kind == "sphere" and "scale" in item:
            if not isinstance(item["scale"], list) or len(item["scale"]) != 3 or any(not 0 < _finite(n, "sphere.scale") <= 10000 for n in item["scale"]): raise ValueError("sphere.scale must be positive")
        for field in ("radius", "depth", "width", "bevel"):
            if field in item and not 0 <= _finite(item[field], field) <= 10000: raise ValueError(f"{field} must be between 0 and 10000")
        if kind == "box" and any(_finite(n, "box.size") <= 0 for n in item["size"]): raise ValueError("Box size must be positive")
        if kind == "cylinder" and (item["radius"] <= 0 or item["depth"] <= 0): raise ValueError("Cylinder dimensions must be positive")
        if kind == "sphere" and item["radius"] <= 0: raise ValueError("Sphere radius must be positive")
        if kind == "beam" and (item["width"] <= 0 or math.dist(item["start"], item["end"]) <= 0): raise ValueError("Beam dimensions must be positive")


def build_template(definition, parameters=None, name=None, template_id=None, bake=True):
    """Validate, expand, then build a component root from a template."""
    raw_json = json.dumps(definition, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    if len(raw_json.encode()) > MAX_JSON: raise ValueError("Definition exceeds JSON limit")
    if template_id is not None and not re.fullmatch(r"template-[a-f0-9]{64}", template_id): raise ValueError("Invalid template ID")
    resolved = _resolve_parameters(definition, parameters)
    for spec in definition.get("materials", {}).values():
        _validate_expression_tree(spec.get("color"), resolved, set())
        for field in ("roughness", "metallic"):
            if field in spec: _validate_expression_tree(spec[field], resolved, set())
        if "texture" in spec:
            _validate_expression_tree(spec["texture"].get("kind"), resolved, set())
            _validate_expression_tree(spec["texture"].get("scale", 1), resolved, set())
    _validate_recipe(definition.get("parts"),resolved,definition.get("materials",{}))
    expanded = _expand(definition.get("parts", []), resolved)
    materials = definition.get("materials", {})
    if not isinstance(materials, dict): raise ValueError("Invalid materials")
    _keys(definition, {"version", "name", "description", "parameters", "materials", "parts"}, "definition")
    if len(materials) > 16: raise ValueError("Too many materials")
    for slot, spec in materials.items():
        _keys(spec, {"color", "roughness", "metallic", "texture"}, f"material {slot}")
        if not isinstance(_expr_with_vars(spec.get("color"), resolved, {}), str): raise ValueError("Material color")
        for field in ("roughness", "metallic"):
            val = _finite(_expr_with_vars(spec.get(field, 0), resolved, {}), field)
            if not 0 <= val <= 1: raise ValueError("Material values must be 0..1")
        _material_color(_expr_with_vars(spec["color"], resolved, {}))
        _texture_spec(spec, resolved)
    _validate_expanded(expanded, materials)
    # Every check above is complete before importing bpy or creating datablocks.
    import bpy
    from .components import create_component
    target_name = name or definition["name"]
    if bpy.data.objects.get(target_name): raise ValueError("Component name already exists")
    mats = {}
    for slot, spec in materials.items():
        if slot not in {item["material"] for item in expanded}: continue
        m = bpy.data.materials.new(f"{target_name}/{slot}"); m.use_nodes = True
        node = m.node_tree.nodes.get("Principled BSDF"); node.inputs["Base Color"].default_value = (*_material_color(_expr_with_vars(spec["color"], resolved, {})), 1); node.inputs["Roughness"].default_value = _expr_with_vars(spec.get("roughness", 0), resolved, {}); node.inputs["Metallic"].default_value = _expr_with_vars(spec.get("metallic", 0), resolved, {})
        tex = _texture_spec(spec, resolved)
        if tex["kind"] != "none":
            nodes,links=m.node_tree.nodes,m.node_tree.links
            coord=nodes.new("ShaderNodeTexCoord")
            mapping=nodes.new("ShaderNodeVectorMath");mapping.operation='MULTIPLY'
            scale=tex['scale']
            mapping.inputs[1].default_value=(3*scale,65*scale,1) if tex['kind']=='wood' else (scale,scale,1)
            links.new(coord.outputs['UV'],mapping.inputs[0])
            noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=3 if tex['kind']=='wood' else 160 if tex['kind']=='leather' else 230
            noise.inputs['Detail'].default_value=3
            links.new(mapping.outputs[0],noise.inputs['Vector'])
            height=noise.outputs['Fac']
            if tex['kind']=='linen':
                waves=[]
                for axis in ['X','Y']:
                    wave=nodes.new('ShaderNodeTexWave');wave.wave_type='BANDS';wave.bands_direction=axis;wave.inputs['Scale'].default_value=140
                    links.new(mapping.outputs[0],wave.inputs['Vector']);waves.append(wave.outputs['Color'])
                weave=nodes.new('ShaderNodeMath');weave.operation='MULTIPLY'
                for index,value in enumerate(waves):links.new(value,weave.inputs[index])
                height=weave.outputs[0]
            bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24 if tex['kind']=='linen' else .16
            bump.inputs['Distance'].default_value=.0009 if tex['kind']=='linen' else .00035
            links.new(height,bump.inputs['Height']);links.new(bump.outputs['Normal'],node.inputs['Normal'])
            tint=nodes.new('ShaderNodeValToRGB')
            base=_material_color(_expr_with_vars(spec['color'],resolved,{}))
            low=.64 if tex['kind']=='wood' else .9
            tint.color_ramp.elements[0].color=tuple(c*low for c in base)+(1,)
            tint.color_ramp.elements[1].color=tuple(min(c*1.05,1) for c in base)+(1,)
            links.new(noise.outputs['Fac'],tint.inputs[0]);links.new(tint.outputs[0],node.inputs['Base Color'])
        mats[slot] = m
    objects = []
    def finish(obj, item):
        obj.data.materials.append(mats[item["material"]]); obj.name = f"{target_name}/{item.get('name', item['kind'])}-{len(objects):03d}"
        obj["agarthaTemplateMaterialSlot"] = item["material"]
        if item.get("bevel", 0) > 0:
            mod = obj.modifiers.new("Template bevel", "BEVEL"); mod.width = item["bevel"]; mod.segments = 2
        objects.append(obj)
    for item in expanded:
        kind = item["kind"]; p = item.get("position", [0, 0, 0])
        if kind == "box":
            size = item["size"]
            bpy.ops.mesh.primitive_cube_add(size=1, location=p); o=bpy.context.object; o.dimensions=size; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        elif kind == "cylinder":
            bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=item["radius"], depth=item["depth"], location=p); o=bpy.context.object; o.rotation_euler=item.get("rotation", [0,0,0])
        elif kind == "sphere":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=item["radius"], location=p); o=bpy.context.object; o.scale=item.get("scale", [1,1,1])
        else:
            start, end = item["start"], item["end"]
            from mathutils import Vector
            a,b=Vector(start),Vector(end); bpy.ops.mesh.primitive_cube_add(size=1, location=(a+b)/2); o=bpy.context.object; o.dimensions=(item["width"],item["width"],(b-a).length); o.rotation_euler=(b-a).to_track_quat("Z","Y").to_euler(); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if "rotation" in item:o.rotation_euler=item["rotation"]
        finish(o, item)
    root = create_component(target_name, objects)
    root["agarthaTemplateId"] = template_id or "template-" + hashlib.sha256(raw_json.encode()).hexdigest()
    root["agarthaTemplateDefinition"] = raw_json
    root["agarthaTemplateParameters"] = json.dumps(resolved, sort_keys=True, separators=(",", ":"))
    if bake:
        from .material_authoring import bake_material
        from .material_mapping import assign_material
        for slot, spec in materials.items():
            if slot not in mats: continue
            tex = _texture_spec(spec, resolved)
            if tex["kind"] == "none": continue
            cache_key = json.dumps({"color": _expr_with_vars(spec["color"], resolved, {}), "texture": tex, "roughness": _expr_with_vars(spec.get("roughness", 0), resolved, {}), "metallic": _expr_with_vars(spec.get("metallic", 0), resolved, {})}, sort_keys=True)
            portable = _BAKE_CACHE.get(cache_key)
            try:
                if portable is not None and portable.name not in bpy.data.materials: portable=None
            except ReferenceError: portable=None
            if portable is None:
                portable = bake_material(mats[slot], resolution=512, tile_size=2.0, name=f"{target_name}-{slot}")
                for tree_node in portable.node_tree.nodes:
                    if tree_node.type == "TEX_IMAGE" and tree_node.image:
                        if tree_node.image.packed_file is None: tree_node.image.pack()
                _BAKE_CACHE[cache_key] = portable
            for obj in objects:
                if obj.get("agarthaTemplateMaterialSlot") == slot:
                    bpy.context.view_layer.update()
                    axis=max(range(3),key=lambda i:obj.dimensions[i]) if tex['kind']=='wood' else 0
                    direction=tuple(1 if i==axis else 0 for i in range(3))
                    assign_material(obj,portable,tile_size=2.0,projection="surface",direction=direction)
    return root
