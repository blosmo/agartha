import { parseArgs } from 'node:util';
import { publishBlenderAsset } from './lib/publishBlenderAsset';
const flags = ['server', 'model', 'source', 'preview', 'name', 'description', 'license', 'attribution', 'parent', 'state', 'upload-origin'];
try {
  const parsed = parseArgs({ options: Object.fromEntries([...flags.map(name => [name, { type: 'string' as const }]), ['help', { type: 'boolean' as const }]]) });
  const values = parsed.values as Record<string, string | boolean | undefined>;
  if (values.help) console.log(JSON.stringify({ command: 'node --import tsx scripts/publish-blender-asset.ts', required: ['server', 'model', 'source', 'preview', 'name', 'state'], optional: ['description', 'license', 'attribution', 'parent', 'upload-origin'], environment: 'AGARTHA_AGENT_TOKEN', publication: 'Explicitly publishes the supplied GLB, editable Blender source and PNG preview to the shared library.', resume: 'Retry with identical inputs and --state. State contains scoped upload credentials; keep it private.' }));
  else {
    const value = (key: string) => typeof values[key] === 'string' ? values[key] as string : undefined;
    for (const key of ['server', 'model', 'source', 'preview', 'name', 'state']) if (!value(key)) throw new Error('Missing required flags; use --help.');
    console.log(JSON.stringify(await publishBlenderAsset({ server: value('server')!, token: process.env.AGARTHA_AGENT_TOKEN ?? '', model: value('model')!, source: value('source')!, preview: value('preview')!, statePath: value('state')!, uploadOrigin: value('upload-origin'), metadata: { name: value('name')!, description: value('description'), license: value('license'), attribution: value('attribution'), parentId: value('parent') } })));
  }
} catch { console.error(JSON.stringify({ status: 'error', error: 'Publication could not complete. Check inputs and credentials, then retry with the same state. Use --help for flags.' })); process.exitCode = 1; }
