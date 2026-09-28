// Persistent artifacts for this repository; no GitHub artifact service is used.
import {appendFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const policies = {'daoist-riversoft-dist': 1, 'validation-source': 3};
const keyPattern = /^([1-9]\d*)-([1-9]\d*)-(daoist-riversoft-dist|validation-source)$/;
const digest = data => createHash('sha256').update(data).digest('hex');
const exists = path => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
const within = (base, path) => { const rel = relative(base, path); return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };

// Check every parent, including directory junctions, before writes or deletion.
export async function safeDirectory(path, create = false) {
  const parent = dirname(path);
  if (parent !== path) await safeDirectory(parent, create);
  if (create && !await exists(path)) await mkdir(path, {mode: 0o700});
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path) throw Error(`Redirected directory: ${path}`);
}

export function context(env = process.env) {
  if (env.GITHUB_REPOSITORY !== 'meviu523/daoist') throw Error('Unexpected artifact repository.');
  if (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ID || '') || !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT || '')) throw Error('Invalid workflow run identity.');
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')) throw Error('Invalid commit SHA.');
  const workspace = resolve(env.GITHUB_WORKSPACE || '.');
  const root = env.DAOIST_ARTIFACT_ROOT || join(homedir(), '.local', 'share', 'daoist-actions');
  if (!isAbsolute(root)) throw Error('DAOIST_ARTIFACT_ROOT must be absolute.');
  const store = join(resolve(root), 'meviu523', 'daoist');
  if (within(workspace, store) || within(store, workspace)) throw Error('Artifact store must be outside the checkout.');
  if (env.RUNNER_TEMP && within(resolve(env.RUNNER_TEMP), store)) throw Error('Artifact store must be outside RUNNER_TEMP.');
  return {workspace, store, repository: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, sha: env.GITHUB_SHA};
}

async function readTree(root, paths = [''], source = false) {
  await safeDirectory(root);
  const files = [];
  async function visit(path) {
    if (path && (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..'))) throw Error(`Unsafe artifact path: ${path}`);
    const full = join(root, path);
    const info = await lstat(full);
    if (info.isSymbolicLink()) throw Error(`Artifact symbolic link: ${path}`);
    if (info.isDirectory()) {
      for (const name of (await readdir(full)).sort()) {
        if (source && (name.startsWith('.') || ['node_modules', '__pycache__'].includes(name))) continue;
        await visit(path ? `${path}/${name}` : name);
      }
    } else {
      if (!info.isFile()) throw Error(`Not an artifact file: ${path}`);
      const data = await readFile(full);
      files.push({path, size: data.length, sha256: digest(data), data});
    }
  }
  for (const path of paths) await visit(path);
  files.sort((a, b) => a.path.localeCompare(b.path));
  if (!files.length) throw Error('Empty artifact.');
  return files;
}

function validateMetadata(meta, key, ctx) {
  const match = keyPattern.exec(key);
  if (!match || meta.schema !== 1 || meta.repository !== ctx.repository || meta.runId !== match[1] || meta.attempt !== match[2] || meta.name !== match[3] || !/^[a-f0-9]{40}$/.test(meta.sha || '')) throw Error('Artifact identity mismatch.');
  if (!Number.isFinite(meta.createdAt) || meta.expiresAt !== meta.createdAt + policies[meta.name] * 86400000) throw Error('Invalid artifact retention.');
}

export async function prune(ctx, now = Date.now()) {
  await safeDirectory(ctx.store, true);
  for (const key of await readdir(ctx.store)) {
    if (!keyPattern.test(key)) continue;
    const directory = join(ctx.store, key);
    // Leave unknown/corrupt entries for inspection, never infer their ownership.
    let meta;
    try {
      await safeDirectory(directory);
      const manifest = join(directory, 'manifest.json');
      if ((await lstat(manifest)).isSymbolicLink()) continue;
      meta = JSON.parse(await readFile(manifest, 'utf8'));
      validateMetadata(meta, key, ctx);
    } catch { continue; }
    if (meta.expiresAt <= now) await rm(directory, {recursive: true});
  }
}

export async function save(ctx, name, now = Date.now(), validation = null) {
  if (!Object.hasOwn(policies, name)) throw Error('Unknown artifact name.');
  await safeDirectory(ctx.workspace);
  const paths = ['public', 'tests', 'scripts', 'tools', 'README.md', 'PROJECT_MEMORY.md', 'package.json', 'server.mjs'];
  if (name === 'validation-source') {
    await safeDirectory(join(ctx.workspace, 'docs'));
    paths.push(...(await readdir(join(ctx.workspace, 'docs'))).filter(file => file.endsWith('.md')).map(file => `docs/${file}`));
  }
  const files = name === 'daoist-riversoft-dist' ? await readTree(join(ctx.workspace, 'dist')) : await readTree(ctx.workspace, paths, true);
  const key = `${ctx.runId}-${ctx.attempt}-${name}`;
  await prune(ctx, now);
  const directory = join(ctx.store, key);
  if (await exists(directory)) throw Error(`Artifact already exists: ${key}`);
  const staging = await mkdtemp(join(ctx.store, '.pending-'));
  try {
    for (const file of files) {
      const target = join(staging, 'files', file.path);
      await mkdir(dirname(target), {recursive: true, mode: 0o700});
      await writeFile(target, file.data, {flag: 'wx', mode: 0o600});
    }
    if (validation) validateEvidence(validation);
    const metadata = {schema: 1, repository: ctx.repository, runId: ctx.runId, attempt: ctx.attempt, sha: ctx.sha, name, createdAt: now, expiresAt: now + policies[name] * 86400000, files: files.map(({data, ...file}) => file), ...(validation ? {validation} : {})};
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(metadata, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    await rename(staging, directory);
    return {key, directory, metadata};
  } finally {
    await rm(staging, {recursive: true, force: true});
  }
}

export function validateEvidence(value) {
  if (!value || value.strict !== true || !Number.isSafeInteger(value.pr) || value.pr < 1 ||
      !['headSha', 'baseSha', 'treeSha'].every(name => /^[a-f0-9]{40}$/.test(value[name] || ''))) throw Error('Invalid validation evidence.');
}

export async function inspect(ctx, key, now = Date.now()) {
  if (!keyPattern.test(key)) throw Error('Invalid artifact key.');
  const directory = join(ctx.store, key);
  await safeDirectory(directory);
  const manifest = join(directory, 'manifest.json');
  if ((await lstat(manifest)).isSymbolicLink()) throw Error('Redirected manifest.');
  const meta = JSON.parse(await readFile(manifest, 'utf8'));
  validateMetadata(meta, key, ctx);
  if (meta.expiresAt <= now) throw Error('Artifact expired; rerun the entire workflow to verify a fresh bundle.');
  const files = await readTree(join(directory, 'files'));
  if (JSON.stringify(files.map(({data, ...file}) => file)) !== JSON.stringify(meta.files)) throw Error('Artifact file checksum mismatch.');
  return {meta, files};
}

// A different workflow may restore only the exact successful PR run verified by
// the release controller against GitHub. Never search for the latest bundle.
export async function restoreValidated(ctx, key, expected, now = Date.now()) {
  validateEvidence(expected.validation);
  const {meta, files} = await inspect(ctx, key, now);
  if (meta.name !== 'daoist-riversoft-dist' || meta.runId !== String(expected.runId) || meta.attempt !== String(expected.attempt) || meta.sha !== expected.sha ||
      !['pr', 'headSha', 'baseSha', 'treeSha', 'strict'].every(name => meta.validation?.[name] === expected.validation[name])) throw Error('Artifact validation does not match the successful PR run.');
  return replaceDist(ctx, files);
}

export async function restore(ctx, key, now = Date.now()) {
  const {meta, files} = await inspect(ctx, key, now);
  if (meta.name !== 'daoist-riversoft-dist' || meta.runId !== ctx.runId || meta.sha !== ctx.sha) throw Error('Artifact does not belong to this deployment.');
  return replaceDist(ctx, files);
}

async function replaceDist(ctx, files) {
  await safeDirectory(ctx.workspace);
  const destination = join(ctx.workspace, 'dist');
  if (await exists(destination)) await safeDirectory(destination);
  const staging = await mkdtemp(join(ctx.workspace, '.runner-dist-'));
  try {
    for (const file of files) {
      const target = join(staging, file.path);
      await mkdir(dirname(target), {recursive: true});
      await writeFile(target, file.data, {flag: 'wx'});
    }
    await rm(destination, {recursive: true, force: true});
    await rename(staging, destination);
  } finally {
    await rm(staging, {recursive: true, force: true});
  }
  return destination;
}

async function main() {
  const [command, value] = process.argv.slice(2);
  const ctx = context();
  if (command === 'save') {
    let validation = null;
    if (value === 'daoist-riversoft-dist' && process.env.GITHUB_EVENT_NAME === 'pull_request') {
      const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
      const git = ref => execFileSync('git', ['rev-parse', ref], {encoding: 'utf8'}).trim();
      validation = {pr: event.number, headSha: git('HEAD^2'), baseSha: git('HEAD^1'), treeSha: git('HEAD^{tree}'), strict: true};
      if (git('HEAD') !== ctx.sha || validation.headSha !== event.pull_request.head.sha || validation.baseSha !== event.pull_request.base.sha) throw Error('PR checkout changed before archiving.');
    }
    const saved = await save(ctx, value, Date.now(), validation);
    console.log(`Saved ${value}: ${saved.directory}`);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `artifact-key=${saved.key}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Self-hosted artifact\n\n- Runner: ${process.env.RUNNER_NAME}\n- Directory: \`${saved.directory}\`\n- Commit: \`${ctx.sha}\`\n- Expires: ${new Date(saved.metadata.expiresAt).toISOString()} (removed on a later archive run)\n- Retrieve from the runner filesystem; no GitHub Artifacts download.\n`);
  } else if (command === 'restore') {
    console.log(`Restored verified artifact: ${await restore(ctx, value)}`);
  } else throw Error('Usage: node scripts/runner-artifacts.mjs save <name> | restore <artifact-key>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
