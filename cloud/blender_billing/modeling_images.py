"""Compact modeler context without changing the full-resolution review evidence."""
from __future__ import annotations
import base64
import io

from PIL import Image, ImageDraw


def _sheet(views: list[dict[str, str]], label: str) -> dict[str, str]:
    if len(views) == 1:
        return dict(views[0])
    if not 1 < len(views) <= 4:
        raise ValueError('A modeling sheet requires two to four views.')
    columns = 2
    canvas = Image.new('RGB', (columns * 384, ((len(views) + 1) // 2) * 384), '#eeeeee')
    draw = ImageDraw.Draw(canvas)
    for index, view in enumerate(views):
        payload = base64.b64decode(view['image'].removeprefix('data:image/jpeg;base64,'), validate=True)
        with Image.open(io.BytesIO(payload)) as source:
            if max(source.size) > 1536:
                raise ValueError('Modeling view exceeds its dimensions.')
            image = source.convert('RGB')
            image.thumbnail((376, 352))
            x, y = (index % columns) * 384, (index // columns) * 384
            draw.text((x + 8, y + 5), view['label'], fill='#111111')
            canvas.paste(image, (x + (384 - image.width) // 2, y + 24 + (352 - image.height) // 2))
    for quality in (78, 70, 60):
        sink = io.BytesIO(); canvas.save(sink, format='JPEG', quality=quality)
        encoded = base64.b64encode(sink.getvalue()).decode()
        if len(encoded) <= 340000:
            return {'label': label, 'image': 'data:image/jpeg;base64,' + encoded}
    raise ValueError('Modeling sheet exceeds its byte limit.')


def modeler_images(references: list[dict[str, str]], rendered: list[dict[str, str]], publication: dict[str, str] | None = None) -> list[dict[str, str]]:
    reference_labels = {'reference-front', 'reference-right', 'reference-rear', 'reference-hero'}
    render_labels = {'render-hero', 'render-front', 'render-right', 'render-back', 'render-detail'}
    for views, allowed in [(references, reference_labels), (rendered, render_labels)]:
        labels = [view['label'] for view in views]
        if len(set(labels)) != len(labels) or any(label not in allowed for label in labels):
            raise ValueError('Unknown or duplicate modeling view.')
    result = [_sheet(references, 'reference-sheet')] if references else []
    whole = [view for view in rendered if view['label'] != 'render-detail']
    if whole: result.append(_sheet(whole, 'render-sheet'))
    result.extend([dict(publication)] if publication else [dict(view) for view in rendered if view['label'] == 'render-detail'])
    return result
