import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../../scripts/check-release.mjs', import.meta.url));
function fixture(run) {
  const cwd = mkdtempSync(join(tmpdir(), 'agartha-release-test-'));
  const write = (file, value = 'Release documentation\n') => {
    mkdirSync(join(cwd, file, '..'), { recursive: true });
    writeFileSync(join(cwd, file), value);
  };
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  const check = () => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
  try {
    git('init', '-q');
    for (const file of ['LICENSE', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'THIRD_PARTY_NOTICES.md', '.env.example', '.github/workflows/ci.yml']) write(file);
    for (const file of ['package.json', 'apps/web/package.json', 'packages/cli/package.json', 'packages/protocol/package.json']) write(file, JSON.stringify({ license: 'MIT' }));
    write('.gitignore', '.env*\n!.env.example\n.agartha/\n');
    run({ cwd, write, git, check });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
test('accepts clean candidates and ignores local secrets', () => fixture(({ write, check }) => {
  write('.env.local', 'private local configuration');
  assert.equal(check().status, 0);
}));
test('rejects credential patterns without disclosing their values', () => fixture(({ write, check }) => {
  const secret = ['ghp', 'a'.repeat(40)].join('_');
  write('leak.txt', secret);
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /possible credential/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
}));
test('rejects ignored private paths when force-staged', () => fixture(({ write, git, check }) => {
  write('.env.local', 'private'); git('add', '-f', '.env.local');
  assert.match(check().stderr, /private or generated file/);
}));
test('rejects staged contents differing from the cleaned working copy', () => fixture(({ write, git, check }) => {
  write('config.txt', ['ghp', 'b'.repeat(40)].join('_')); git('add', 'config.txt');
  write('config.txt', 'clean');
  const result = check();
  assert.equal(result.status, 1); assert.match(result.stderr, /index and working tree differ/);
}));
test('rejects missing required documents and symbolic links', () => fixture(({ cwd, check }) => {
  rmSync(join(cwd, 'LICENSE')); symlinkSync('README.md', join(cwd, 'linked.md'));
  const result = check();
  assert.equal(result.status, 1); assert.match(result.stderr, /LICENSE: missing/); assert.match(result.stderr, /non-regular/);
}));
