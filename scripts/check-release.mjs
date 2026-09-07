// Inspect Git's publication candidates, never print matching secret values.
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';

const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const problems = [];
// A clean working copy cannot prove that a different index blob is safe.
for (const file of execFileSync('git', ['diff', '--name-only', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)) {
  problems.push(`${file}: index and working tree differ; review and stage the intended contents before checking release`);
}
const excluded = /(^|\/)(?:\.agartha|\.agartha-bin|\.vercel|\.codex|\.venv|node_modules|target|dist|coverage|__pycache__)(?:\/|$)|(^|\/)\.env(?:\..*)?$|\.(?:pem|key|pyc)$/;
const secrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp_|github_pat_|sk_live_|sk-proj-)[A-Za-z0-9_-]{16,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
];
for (const file of files) {
  if (excluded.test(file) && file !== '.env.example') problems.push(`${file}: private or generated file in release candidates`);
  let stat;
  try { stat = lstatSync(file); } catch { problems.push(`${file}: missing working-tree file`); continue; }
  if (!stat.isFile()) { problems.push(`${file}: review non-regular file before publication`); continue; }
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  if (secrets.some(pattern => pattern.test(text))) problems.push(`${file}: possible credential (value withheld)`);
}
for (const file of ['LICENSE', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'THIRD_PARTY_NOTICES.md', '.env.example', '.github/workflows/ci.yml']) {
  if (!files.includes(file)) problems.push(`${file}: missing from release candidates`);
}
for (const file of ['package.json', 'apps/web/package.json', 'packages/cli/package.json', 'packages/protocol/package.json']) {
  if (JSON.parse(readFileSync(file, 'utf8')).license !== 'MIT') problems.push(`${file}: inconsistent license`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} release candidates: required files present; no recognized private paths or credential patterns.`);
  console.log('This lightweight check is not a complete secret scan or a review of contribution rights. Review the staged diff before publishing.');
}
