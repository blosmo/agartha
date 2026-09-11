import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
import {expect,it} from 'vitest';

it('loads the modeling entry in ordinary Node ESM after TypeScript transpilation',()=>{
  const root=mkdtempSync(join(tmpdir(),'agartha-modeling-esm-'));
  try{
    writeFileSync(join(root,'package.json'),' {"type":"module"}');
    symlinkSync(resolve('node_modules'),join(root,'node_modules'),'dir');
    const files=['packages/modeling/studio.ts','packages/modeling/quality.ts','packages/billing/ledgerClient.ts',...['assetTemplates','materialContributions','canonicalAssets','modelAssets','pngValidation','geometry/glb','geometry/glbImages','geometry/inspectGlb'].map(name=>`packages/protocol/src/${name}.ts`)];
    for(const file of files){
      const destination=join(root,file.replace(/\.ts$/,'.js'));mkdirSync(dirname(destination),{recursive:true});
      writeFileSync(destination,ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
    }
    const entry=pathToFileURL(join(root,'packages/modeling/studio.js')).href;
    const result=spawnSync(process.execPath,['--input-type=module','-e',`const {parseStudioAction}=await import(${JSON.stringify(entry)}); const step=parseStudioAction({action:'search_materials',code:'{"q":"wood"}',objectName:'',views:[],summary:'Search',critique:''}); if(JSON.parse(step.code).q!=='wood')process.exit(2);`],{encoding:'utf8',timeout:10000});
    expect(result.status,result.stderr).toBe(0);
  }finally{rmSync(root,{recursive:true,force:true});}
});
