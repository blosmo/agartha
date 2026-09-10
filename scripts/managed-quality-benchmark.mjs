/** Resume exactly two pre-created, approved jobs; never creates or funds a job.
 * node scripts/managed-quality-benchmark.mjs STATE.json status|start|download baseline|improved
 * STATE.json: {baseUrl, brief, runs:{baseline:{jobId,budgetCents:500},improved:{jobId,budgetCents:500}}}
 * Supply AGARTHA_BENCHMARK_TOKEN separately. Keep the manifest outside the repository.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const terminal = new Set(['completed', 'partial', 'failed', 'cancelled']);
const artifactNames = new Set(['model.glb', 'model.blend', 'preview.png', 'turnaround.mp4', 'reference.jpg', 'review.json']);

export function validateManifest(state) {
  const origin = new URL(state.baseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.origin !== state.baseUrl) throw Error('Expected a credential-free HTTPS origin');
  if (typeof state.brief !== 'string' || !state.brief.trim()) throw Error('Missing exact benchmark brief');
  if (Object.keys(state.runs ?? {}).sort().join(',') !== 'baseline,improved') throw Error('Exactly two approved runs required');
  const ids = new Set();
  for (const run of Object.values(state.runs)) {
    if (run.budgetCents !== 500 || !/^[a-zA-Z0-9-]{1,80}$/.test(run.jobId)) throw Error('Each run needs a job ID and a 500-cent cap');
    ids.add(run.jobId);
  }
  if (ids.size !== 2) throw Error('Runs must have distinct job IDs');
}

export async function runBenchmark({ state, name, action, token, save, writeArtifact, fetchImpl = fetch }) {
  validateManifest(state);
  if (!token || !state.runs[name] || !['start', 'status', 'download'].includes(action)) throw Error('Choose a run and action, and supply the token');
  const run = state.runs[name];
  const route = `/api/blender/jobs/${run.jobId}`;
  async function request(suffix, method = 'GET') {
    const response = await fetchImpl(state.baseUrl + route + suffix, {
      method, redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    if (!response.ok) throw Error(`Service returned HTTP ${response.status}`);
    return response;
  }
  const row = await (await request('')).json();
  if (row.jobId !== run.jobId || row.budgetCents !== 500 || row.brief !== state.brief) throw Error('Stored job does not match the approved brief and cap');
  if ((name === 'improved') !== (row.workflowVersion === 3)) throw Error('Unexpected workflow version');
  run.status = row;
  await save(state);
  if (action === 'start') {
    if (run.startAttempted || !['funded', 'queued'].includes(row.status)) throw Error('Refusing another or uncertain start; inspect status instead');
    run.startAttempted = new Date().toISOString();
    await save(state);
    await request('/start', 'POST');
    run.startAcknowledged = true;
    await save(state);
  }
  if (action === 'download') {
    if (!terminal.has(row.status)) throw Error('Wait for terminal artifacts');
    for (const artifact of row.artifacts ?? []) {
      if (!artifactNames.has(artifact.name) || artifact.url !== `${route}/artifacts/${artifact.name}`) throw Error('Unexpected artifact route');
      const response = await request(`/artifacts/${artifact.name}`);
      if (!response.body) throw Error('Missing artifact body');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > 16 * 1024 * 1024) throw Error('Artifact exceeds 16 MiB allowance');
          chunks.push(next.value);
        }
      } catch (error) {
        await reader.cancel();
        throw error;
      }
      const bytes = Buffer.concat(chunks);
      await writeArtifact(name, artifact.name, bytes);
      run.downloads ??= {};
      run.downloads[artifact.name] = { bytes: size, sha256: createHash('sha256').update(bytes).digest('hex') };
      await save(state);
    }
  }
  return { name, jobId: run.jobId, status: row.status, chargedCents: row.chargedCents, pendingAiCents: row.pendingAiCents, computeStatus: row.computeStatus, startAcknowledged: run.startAcknowledged ?? false, downloads: run.downloads ?? {} };
}

async function main() {
  const [filename, action, name] = process.argv.slice(2);
  if (!filename) throw Error('Pass a private manifest path, action, and run name');
  const resolved = path.resolve(filename);
  const lock = await fs.open(resolved + '.lock', 'wx', 0o600).catch(() => { throw Error('Benchmark is locked; inspect the previous process before removing its lock'); });
  try {
    const state = JSON.parse(await fs.readFile(resolved, 'utf8'));
    const result = await runBenchmark({ state, action, name, token: process.env.AGARTHA_BENCHMARK_TOKEN,
      save: async value => {
        await fs.writeFile(resolved + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 });
        await fs.rename(resolved + '.tmp', resolved);
      },
      writeArtifact: async (run, artifact, bytes) => {
        const directory = path.join(path.dirname(resolved), run);
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        await fs.writeFile(path.join(directory, artifact), bytes, { mode: 0o600 });
      },
    });
    console.log(JSON.stringify(result));
  } finally {
    await lock.close();
    await fs.unlink(resolved + '.lock');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
