import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {context, prune, restore, restoreValidated, save} from '../scripts/runner-artifacts.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'daoist-artifact-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const workspace = join(root, 'checkout');
  await mkdir(join(workspace, 'dist', 'js'), {recursive: true});
  await writeFile(join(workspace, 'dist', 'index.html'), '<script src="js/game.js"></script>');
  await writeFile(join(workspace, 'dist', 'js', 'game.js'), 'original');
  const env = {GITHUB_REPOSITORY: 'meviu523/daoist', GITHUB_WORKSPACE: workspace, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40), DAOIST_ARTIFACT_ROOT: join(root, 'archive')};
  return {root, workspace, env, ctx: context(env)};
}

test('verified bundle survives checkout cleanup and publish-only reruns', async t => {
  const {ctx, env, workspace} = await fixture(t);
  const saved = await save(ctx, 'daoist-riversoft-dist', 1000);
  await rm(join(workspace, 'dist'), {recursive: true});
  await restore(context({...env, GITHUB_RUN_ATTEMPT: '2'}), saved.key, 2000);
  assert.equal(await readFile(join(workspace, 'dist', 'js', 'game.js'), 'utf8'), 'original');
  assert.equal(saved.metadata.sha, env.GITHUB_SHA);
  assert.equal(saved.metadata.files.length, 2);
});

test('corrupt or additional files cannot replace the current build', async t => {
  const {ctx, workspace} = await fixture(t);
  const saved = await save(ctx, 'daoist-riversoft-dist');
  await writeFile(join(saved.directory, 'files', 'js', 'game.js'), 'corrupted');
  await assert.rejects(restore(ctx, saved.key), /checksum mismatch/);
  assert.equal(await readFile(join(workspace, 'dist', 'js', 'game.js'), 'utf8'), 'original');
  await writeFile(join(saved.directory, 'files', 'js', 'game.js'), 'original');
  await writeFile(join(saved.directory, 'files', 'extra.js'), 'extra');
  await assert.rejects(restore(ctx, saved.key), /checksum mismatch/);
});

test('run, SHA, traversal and expiry mismatches fail before writing dist', async t => {
  const {ctx, env} = await fixture(t);
  const saved = await save(ctx, 'daoist-riversoft-dist', 1000);
  await assert.rejects(restore(context({...env, GITHUB_SHA: 'b'.repeat(40)}), saved.key, 2000), /does not belong/);
  await assert.rejects(restore(context({...env, GITHUB_RUN_ID: '124'}), saved.key, 2000), /does not belong/);
  await assert.rejects(restore(ctx, '../outside', 2000), /Invalid artifact key/);
  await assert.rejects(restore(ctx, saved.key, saved.metadata.expiresAt), /expired/);
});

test('same attempt is immutable and a full rerun gets a separate directory', async t => {
  const {ctx, env} = await fixture(t);
  const first = await save(ctx, 'daoist-riversoft-dist');
  await assert.rejects(save(ctx, 'daoist-riversoft-dist'), /already exists/);
  const second = await save(context({...env, GITHUB_RUN_ATTEMPT: '2'}), 'daoist-riversoft-dist');
  assert.notEqual(first.directory, second.directory);
});

test('retention only removes expired owned artifacts and preserves unknown directories', async t => {
  const {ctx, env} = await fixture(t);
  const expired = await save(ctx, 'daoist-riversoft-dist', 1000);
  const fresh = await save(context({...env, GITHUB_RUN_ATTEMPT: '2'}), 'daoist-riversoft-dist', 2000);
  const unrelated = join(ctx.store, 'keep-other-project');
  const corrupt = join(ctx.store, '999-1-daoist-riversoft-dist');
  await mkdir(unrelated);
  await mkdir(corrupt);
  await writeFile(join(corrupt, 'manifest.json'), '{}');
  await prune(ctx, expired.metadata.expiresAt);
  assert.deepEqual((await readdir(ctx.store)).sort(), [fresh.key, 'keep-other-project', '999-1-daoist-riversoft-dist'].sort());
});

test('store cannot live in the checkout and invalid identities are refused', async t => {
  const {env, workspace, root} = await fixture(t);
  assert.throws(() => context({...env, DAOIST_ARTIFACT_ROOT: workspace}), /outside the checkout/);
  assert.throws(() => context({...env, GITHUB_REPOSITORY: '../../outside'}), /repository/);
  assert.throws(() => context({...env, GITHUB_RUN_ID: '../1'}), /identity/);
  assert.throws(() => context({...env, GITHUB_SHA: 'main'}), /SHA/);
  assert.throws(() => context({...env, DAOIST_ARTIFACT_ROOT: 'relative'}), /absolute/);
  assert.throws(() => context({...env, RUNNER_TEMP: root}), /outside RUNNER_TEMP/);
  assert.throws(() => context({...env, GITHUB_WORKSPACE: join(root, 'archive', 'meviu523', 'daoist', 'checkout')}), /outside the checkout/);
});

test('directory links cannot redirect storage, bundle restore or cleanup', async t => {
  const {ctx, env, root, workspace} = await fixture(t);
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'keep.txt'), 'keep');
  const link = join(root, 'linked-root');
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(save(context({...env, DAOIST_ARTIFACT_ROOT: link}), 'daoist-riversoft-dist'), /Redirected directory/);
  const saved = await save(ctx, 'daoist-riversoft-dist', 1000);
  await rm(join(workspace, 'dist'), {recursive: true});
  await symlink(outside, join(workspace, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(restore(ctx, saved.key, 2000), /Redirected directory/);
  await symlink(outside, join(ctx.store, '999-1-daoist-riversoft-dist'), process.platform === 'win32' ? 'junction' : 'dir');
  await prune(ctx, saved.metadata.expiresAt);
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'keep');
});

test('source snapshot retains validation inputs for three days and excludes local secrets', async t => {
  const {ctx, workspace} = await fixture(t);
  for (const name of ['public', 'tests', 'scripts', 'tools', 'docs']) {
    await mkdir(join(workspace, name));
    await writeFile(join(workspace, name, 'example.md'), name);
  }
  for (const name of ['README.md', 'PROJECT_MEMORY.md', 'package.json', 'server.mjs']) await writeFile(join(workspace, name), name);
  await writeFile(join(workspace, '.env'), 'PRIVATE');
  await writeFile(join(workspace, 'public', '.env'), 'PRIVATE');
  const saved = await save(ctx, 'validation-source', 1000);
  assert.equal(saved.metadata.expiresAt, 1000 + 3 * 86400000);
  assert(saved.metadata.files.some(file => file.path === 'docs/example.md'));
  assert(!saved.metadata.files.some(file => file.path.includes('.env') || file.path.startsWith('dist/')));
  await assert.rejects(restore(ctx, saved.key, 2000), /does not belong/);
});

test('a squash release can restore a different run only with matching strict validation evidence', async t => {
  const {ctx, env, workspace} = await fixture(t);
  const validation = {pr: 53, headSha: 'b'.repeat(40), baseSha: 'c'.repeat(40), treeSha: 'd'.repeat(40), strict: true};
  const saved = await save(ctx, 'daoist-riversoft-dist', Date.now(), validation);
  const release = context({...env, GITHUB_RUN_ID: '456', GITHUB_SHA: 'e'.repeat(40)});
  const expected = {runId: '123', attempt: '1', sha: ctx.sha, validation};
  await assert.rejects(restore(release, saved.key), /does not belong/);
  await restoreValidated(release, saved.key, expected);
  assert.equal(await readFile(join(workspace, 'dist', 'js', 'game.js'), 'utf8'), 'original');
  for (const field of ['headSha', 'baseSha', 'treeSha']) {
    await assert.rejects(restoreValidated(release, saved.key, {...expected, validation: {...validation, [field]: 'f'.repeat(40)}}), /does not match/);
  }
  await assert.rejects(restoreValidated(release, saved.key, {...expected, attempt: '2'}), /does not match/);
  await assert.rejects(restoreValidated(release, saved.key, {...expected, validation: {...validation, strict: false}}), /Invalid validation/);
  await writeFile(join(saved.directory, 'files', 'js', 'game.js'), 'tampered');
  await assert.rejects(restoreValidated(release, saved.key, expected), /checksum mismatch/);
});
