import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { STARTER_DEFINITIONS } from './starterDefinitions';
import { starterPlacement } from './starterPlacement';
import type { StarterCatalog } from '../../apps/web/starterCatalog';
import { inspectGlb } from '../../packages/protocol/src/geometry/inspectGlb';

const { values } = parseArgs({ options: { input: { type: 'string' }, output: { type: 'string' } } });
const input = resolve(values.input ?? '.agartha/starter-assets');
const output = resolve(values.output ?? 'apps/web/public/starter-assets');
const catalog: StarterCatalog = { schema: 1, models: [], worlds: [] };
const files: Array<{ name: string; bytes: Buffer }> = [];
for (const definition of STARTER_DEFINITIONS) {
  const directory = join(input, definition.stem);
  const metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'));
  const publications: Record<string, { modelId: string; manifestUrl: string }> = {};
  for (const role of ['scene', 'component'] as const) {
    const publication = JSON.parse(await readFile(join(directory, `${role}-publication.json`), 'utf8'));
    const bytes = await readFile(join(directory, `${role}.glb`));
    const modelId = `model-${createHash('sha256').update(bytes).digest('hex')}`;
    if (publication.status !== 'complete' || publication.modelId !== modelId) throw new Error(`Publish the exact ${definition.stem}/${role} before catalog creation.`);
    inspectGlb(bytes);
    publications[role] = publication;
    if (!catalog.models.some(model => model.modelId === modelId)) {
      const file = `${definition.stem}-${role}.glb`;
      files.push({ name: file, bytes });
      catalog.models.push({
        modelId, file, bytes: bytes.length,
        bounds: metadata[role === 'scene' ? 'runtime' : 'componentRuntime'].bounds,
        name: role === 'scene' ? definition.name : definition.component,
        description: role === 'scene' ? definition.description : definition.componentDescription,
        author: 'Agartha Studio', license: 'MIT', attribution: 'Created by Agartha Studio with GPT-6 Astra and Blender.',
        source: publication.manifestUrl,
      });
    }
  }
  catalog.worlds.push({
    id: definition.id, name: definition.name,
    brief: `${definition.description} Preserve contributions and keep the four gateways clear. Use the open clearing for new work. Shared scene and editable source: ${publications.scene.manifestUrl} Reusable component: ${publications.component.manifestUrl}`,
    objects: starterPlacement(definition.stem, definition.name, publications.scene.modelId, metadata.runtime.bounds, definition.ground),
  });
}
await mkdir(output, { recursive: true });
for (const file of files) await writeFile(join(output, file.name), file.bytes);
await writeFile(join(output, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ worlds: catalog.worlds.length, models: catalog.models.length, runtimeBytes: files.reduce((sum, file) => sum + file.bytes.length, 0) }));
