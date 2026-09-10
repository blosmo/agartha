"""Preflight must reject invalid recipes before importing Blender."""
import json
import unittest
from unittest.mock import patch
from pathlib import Path
from .asset_templates import build_template, _validate_expanded


class TemplatePreflightTests(unittest.TestCase):
    def test_computed_dimensions_are_bounded(self):
        for item in [
            {'kind':'sphere','material':'wood','position':[0,0,0],'radius':1e12},
            {'kind':'sphere','material':'wood','position':[0,0,0],'radius':1,'scale':[1e12,1,1]},
            {'kind':'cylinder','material':'wood','position':[0,0,0],'radius':1,'depth':1e12},
        ]:
            with self.subTest(item=item), self.assertRaises(ValueError):
                _validate_expanded([item], {'wood':{}})

    def test_false_branch_is_still_validated(self):
        definition=json.loads((Path(__file__).parents[2]/'scripts/showcase/chair-template.json').read_text())
        definition['parts'].append({'kind':'execute','when':False,'code':'invalid'})
        with self.assertRaises(ValueError):
            build_template(definition)

    def test_unicode_definition_uses_utf8_limit(self):
        choices=['椅'*26+str(i) for i in range(8)]
        definition={'version':1,'name':'Unicode chair','description':'Valid Unicode controls',
                    'parameters':{f'choice{i}':{'type':'enum','default':choices[0],'values':choices} for i in range(24)},
                    'materials':{'wood':{'color':'#806040'}},
                    'parts':[{'kind':'box','name':'Seat','material':'wood','position':[0,0,0],'size':[1,1,1]}]}
        self.assertLess(len(json.dumps(definition,ensure_ascii=False,separators=(',',':')).encode()),32000)
        self.assertGreater(len(json.dumps(definition,ensure_ascii=True,separators=(',',':')).encode()),32768)
        with patch('cloud.blender_mcp.asset_templates._validate_expanded',side_effect=RuntimeError('validated unicode')):
            with self.assertRaisesRegex(RuntimeError,'validated unicode'):
                build_template(definition)
