import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MATERIAL_CATALOG} from '../packages/protocol/src/materials.js';
const sources=['packages/protocol/src/materials.ts','packages/protocol/src/surfaceShaders.ts'];
const sourceSha256=createHash('sha256').update(Buffer.concat(sources.map(path=>readFileSync(path)))).digest('hex');
writeFileSync('cloud/blender_mcp/material_catalog.json',JSON.stringify({generated:true,sourceSha256,...MATERIAL_CATALOG},null,2)+'\n');
