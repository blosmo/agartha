from __future__ import annotations
import base64
import io
import unittest
from PIL import Image

from .modeling_images import modeler_images


def view(label, color):
    stream = io.BytesIO(); Image.new('RGB', (512, 512), color).save(stream, format='JPEG')
    return {'label': label, 'image': 'data:image/jpeg;base64,' + base64.b64encode(stream.getvalue()).decode()}


def decoded(value):
    return Image.open(io.BytesIO(base64.b64decode(value['image'].split(',', 1)[1])))


class ModelingImagesTests(unittest.TestCase):
    def test_sheets_keep_reference_and_render_views_separate_and_detail_unchanged(self):
        references = [view('reference-' + name, color) for name, color in [('front', 'red'), ('right', 'green'), ('rear', 'blue'), ('hero', 'yellow')]]
        rendered = [view('render-' + name, '#777777') for name in ['hero', 'front', 'right']]
        detail = view('render-detail', 'white')
        packed = modeler_images(references, [*rendered, detail])
        self.assertEqual([item['label'] for item in packed], ['reference-sheet', 'render-sheet', 'render-detail'])
        self.assertEqual(packed[-1], detail)
        with decoded(packed[0]) as image:
            self.assertEqual(image.size, (768, 768))
            for position, expected in [((192, 200), (255, 0, 0)), ((576, 200), (0, 128, 0)), ((192, 584), (0, 0, 255)), ((576, 584), (255, 255, 0))]:
                self.assertTrue(all(abs(a - b) < 10 for a, b in zip(image.getpixel(position), expected)))
        with decoded(packed[1]) as image:
            self.assertEqual(image.size, (768, 768))
            self.assertEqual(image.getpixel((576, 584)), (238, 238, 238))  # no invented fourth view
        for item in packed: self.assertLessEqual(len(item['image']), 350000)
        self.assertEqual([item['label'] for item in references], ['reference-front', 'reference-right', 'reference-rear', 'reference-hero'])

    def test_single_views_keep_their_resolution_and_publication_preview_is_distinct(self):
        hero, detail, publication = view('render-hero', 'red'), view('render-detail', 'blue'), view('render-detail', 'green')
        self.assertEqual(modeler_images([], [hero, detail]), [hero, detail])
        self.assertEqual(modeler_images([], [hero, detail], publication), [hero, publication])
        self.assertEqual(modeler_images([], []), [])

    def test_unknown_and_duplicate_views_are_rejected(self):
        front = view('reference-front', 'red')
        with self.assertRaises(ValueError): modeler_images([front, front], [])
        with self.assertRaises(ValueError): modeler_images([view('reference-imagined', 'red')], [])
