import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('loads the emitted hosted chat entry in Node without bundler resolution', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = await mkdtemp(join(tmpdir(), 'agartha-chat-runtime-'));
  try {
    await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
    await symlink(resolve(root, 'node_modules'), join(output, 'node_modules'), 'dir');
    for (const source of ['apps/web/hostedChatStream.ts', 'apps/web/chatStream.ts', 'packages/protocol/src/chat.ts']) {
      const compiled = ts.transpileModule(await readFile(join(root, source), 'utf8'), {
        fileName: source,
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      const destination = join(output, source.replace(/\.ts$/, '.js'));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, compiled.outputText);
    }
    const entry = pathToFileURL(join(output, 'apps/web/hostedChatStream.js')).href;
    const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e',
      `const module = await import(${JSON.stringify(entry)}); console.log(typeof module.hostedChatStream);`], { timeout: 10_000 });
    expect(result.stdout.trim()).toBe('function');
  } finally { await rm(output, { recursive: true, force: true }); }
});
