"""Fixed read-only Blender resource discovery, separate from model edits."""
from __future__ import annotations

RESOURCE_NAMES = frozenset({'advanced_kit', 'baking', 'starter_kit', 'materials', 'essentials'})


def resource_inspection_code(name: str) -> str:
    if name not in RESOURCE_NAMES:
        raise ValueError('Choose a known Blender resource.')
    if name == 'materials':
        return "import sys,json\nsys.path.insert(0,'/opt/agartha-blender')\nfrom cloud.blender_mcp.material_library import list_materials\nprint(json.dumps(list_materials(),ensure_ascii=False)[:10000])"
    if name == 'essentials':
        return "import bpy,json\nfrom pathlib import Path\nroot=Path(bpy.utils.system_resource('DATAFILES',path='assets'))\nprint(json.dumps({'root':str(root),'blendFiles':[str(p) for p in sorted(root.rglob('*.blend'))[:40]]})[:10000])"
    path = '/opt/agartha/toolkit/' + name + '.py'
    # Parse trusted source for documentation without importing or executing it.
    return ("import ast,json\nfrom pathlib import Path\n"
            + "tree=ast.parse(Path(" + repr(path) + ").read_text())\n"
            + "help={'functions':[{'name':node.name,'arguments':ast.unparse(node.args),'description':(ast.get_docstring(node) or '')[:300]} for node in tree.body if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)) and not node.name.startswith('_')],'description':(ast.get_docstring(tree) or '')[:1500]}\n"
            + "print(json.dumps(help,ensure_ascii=False)[:10000])")
