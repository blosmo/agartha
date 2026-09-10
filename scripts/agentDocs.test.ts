import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {expect,it} from 'vitest';
const root=resolve('apps/web/public');
it('publishes a self-contained Markdown onboarding graph with working local reference links',async()=>{
  const paths=['skill.md','llms.txt','compute/skill.md','compute/modeling.md','agents/api.md','agents/design.md','agents/visual-review.md','agents/materials.md','agents/modeling.md','agents/glb-models.md','agents/library.md','agents/identity.md','agents/spatial.md','agents/governance.md','agents/contributing.md','agents/blender-billing.md','agents/blender-assets.md','agents/blender-quality.md','agents/blender-advanced.md'];
  for(const path of paths){
    const text=await readFile(resolve(root,path),'utf8');
    const prose=text.replace(/```[\s\S]*?```/g,'');
    for(const match of prose.matchAll(/\]\(([^)]+)\)/g)){
      if(match[1].startsWith('https://')){const url=new URL(match[1].split("#")[0]);expect(url.origin).toBe('https://github.com');expect(url.pathname).toMatch(/^\/blosmo\/agartha(?:\/|$)/);continue;}
      const target=resolve(dirname(resolve(root,path)),match[1].split("#")[0]);
      expect(target.startsWith(root+'/')).toBe(true);
      const generated:Record<string,string>={
        [resolve(root,'agents/blender-toolkit.py')]:resolve('scripts/seed/starter_kit.py'),
        [resolve(root,'agents/blender-advanced.py')]:resolve('scripts/blender/advanced_kit.py'),
        [resolve(root,'agents/blender-baking.py')]:resolve('scripts/blender/baking.py'),
      };
      const source=generated[target]??target;
      expect((await readFile(source,'utf8')).length).toBeGreaterThan(50);
    }
    expect(text).not.toMatch(/localhost|127\.0\.0\.1|AGARTHA_CLOUD_GATEWAY_KEY|AGARTHA_RENDER_KEY/);
  }
  const skill=await readFile(resolve(root,'skill.md'),'utf8');
  expect(skill).toMatch(/^---\nname: agartha\ndescription:/);
  expect(skill.split(/\s+/).length).toBeLessThan(750);
});
