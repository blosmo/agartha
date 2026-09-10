"""Package reviewed local renders with portable provenance and reproducible source."""
import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
source=Path(sys.argv[1])
target=ROOT/'apps/web/public/compute/gallery'
slugs=['verdant-conservatory','lantern-courtyard','celestial-engine','chair-family']
for slug in slugs:
    src=source/slug;dst=target/slug;dst.mkdir(parents=True,exist_ok=True)
    shutil.copy2(src/'model.glb',dst/'model.glb')
    Image.open(src/'preview.png').convert('RGB').save(dst/'preview.jpg',quality=91,optimize=True)
    provenance=json.loads((src/'provenance.json').read_text()) if (src/'provenance.json').exists() else {'title':'One chair, many possibilities','createdWith':'Local Blender 4.5 and Agartha procedural templates','hostingComputeCents':0,'paidInferenceCalls':0,'geometrySource':'Original agent-authored declarative template','runtime':'4.5.0','quality':'final'}
    provenance.pop('components',None)
    if 'statistics' in provenance: provenance['statistics'].pop('path',None)
    provenance['license']='MIT';provenance['attribution']='Agartha contributors'
    provenance['modelSha256']=hashlib.sha256((dst/'model.glb').read_bytes()).hexdigest()
    provenance['files']={'model':'model.glb','preview':'preview.jpg','editableSource':'source.zip'}
    if slug=='chair-family':
        provenance['template']=json.loads((ROOT/'scripts/showcase/chair-template-provenance.json').read_text())
        provenance['parameterCount']=15;provenance['variantCount']=9
    (dst/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    with zipfile.ZipFile(dst/'source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as bundle:
        bundle.write(src/'model.blend','model.blend')
        bundle.write(src/'assembly.json','assembly.json')
        bundle.write(dst/'provenance.json','provenance.json')
        bundle.write(ROOT/'LICENSE','LICENSE')
        for folder,pattern in [('scripts/showcase','*'),('scripts/seed','*.py'),('cloud/blender_mcp','*.py')]:
            for path in (ROOT/folder).glob(pattern):
                if path.is_file():bundle.write(path,str(path.relative_to(ROOT)))
        bundle.writestr('README.txt','Open model.blend in Blender 4.5.0. Materials and textures are packed in the file.\nThe assembly hierarchy preserves reusable components.\nRebuild geometry from this directory with:\nblender --background --factory-startup --python-exit-code 1 --python scripts/showcase/'+('chair_family.py' if slug=='chair-family' else 'build_models.py')+' -- ./output '+slug+' final\nRendering uses your local computer. No hosted generation API is called.\n')
    print(slug, 'GLB', (dst/'model.glb').stat().st_size, 'ZIP', (dst/'source.zip').stat().st_size)
