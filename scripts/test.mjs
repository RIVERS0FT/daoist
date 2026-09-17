import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
rmSync('.test-dist', { recursive: true, force: true });
mkdirSync('.test-dist');
writeFileSync('.test-dist/package.json', '{"type":"commonjs"}\n');
const args = ['-p', 'tsconfig.test.json'];
if (Number(ts.versionMajorMinor.split('.')[0]) >= 6) args.push('--ignoreDeprecations', '6.0');
// npm scripts add node_modules/.bin to PATH. Use the public CLI, not unexported package internals.
const compiled = spawnSync('tsc', args, { stdio: 'inherit', shell: process.platform === 'win32' });
if (compiled.error) console.error(compiled.error.message);
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
const files = readdirSync('tests').filter((name) => name.endsWith('.test.mjs')).sort().map((name) => `tests/${name}`);
const tested = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(tested.status ?? 1);
