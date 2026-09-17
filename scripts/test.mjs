import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Compile an exact source copy inside an explicit CommonJS package. Production
// remains an ESM Vite application; tests use Node's supported module resolution.
for (const folder of ['.test-src', '.test-dist']) rmSync(folder, { recursive: true, force: true });
cpSync('src/game', '.test-src', { recursive: true });
mkdirSync('.test-dist');
for (const folder of ['.test-src', '.test-dist']) writeFileSync(`${folder}/package.json`, '{"type":"commonjs"}\n');
// npm scripts add node_modules/.bin to PATH; do not import private compiler paths.
const compiled = spawnSync('tsc', ['-p', 'tsconfig.test.json'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (compiled.error) console.error(compiled.error.message);
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
const files = readdirSync('tests').filter((name) => name.endsWith('.test.mjs')).sort().map((name) => `tests/${name}`);
const tested = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(tested.status ?? 1);
