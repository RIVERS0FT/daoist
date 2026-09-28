import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {context, save} from '../scripts/runner-artifacts.mjs';
import {checkCandidate, checkPull, checkRun, errorExcerpt, redact, requestFor} from '../scripts/delivery-lib.mjs';

const head = 'b'.repeat(40), base = 'c'.repeat(40), tree = 'd'.repeat(40), testedSha = 'a'.repeat(40), mergedSha = 'e'.repeat(40);
const repository = 'meviu523/daoist';
const pull = {number: 53, state: 'open', merged: false, draft: false, head: {sha: head, repo: {full_name: repository}}, base: {ref: 'main', repo: {full_name: repository}}};
const run = {id: 123, run_attempt: 1, workflow_id: 456, path: '.github/workflows/ci.yml', event: 'pull_request', head_repository: {full_name: repository}, head_sha: head, status: 'completed', conclusion: 'success'};
const validation = {pr: 53, headSha: head, baseSha: base, treeSha: tree, strict: true};

test('delivery requests are commit-bound, cancellable and repository scoped', () => {
  const request = {context: 'daoist/delivery-request', state: 'success', target_url: `https://github.com/${repository}/pull/53`, creator: {login: 'writer'}};
  assert.deepEqual(requestFor([request], head), {pr: 53, headSha: head, actor: 'writer'});
  assert.equal(requestFor([{...request, state: 'failure'}, request], head), null);
  assert.equal(requestFor([{...request, target_url: 'https://github.com/other/repo/pull/53'}], head), null);
  assert.throws(() => requestFor([request], 'main'), /Invalid/);
});

test('a newer head, fork, draft or unrelated workflow cannot reuse validation', () => {
  checkPull(pull, head);
  assert.throws(() => checkPull(pull, base), /changed/);
  assert.throws(() => checkPull({...pull, draft: true}, head), /changed/);
  assert.throws(() => checkPull({...pull, head: {...pull.head, repo: {full_name: 'other/repo'}}}, head), /changed/);
  assert.equal(checkRun(run, 456, head), true);
  assert.equal(checkRun({...run, status: 'in_progress'}, 456, head), false);
  assert.throws(() => checkRun({...run, workflow_id: 999}, 456, head), /does not belong/);
  assert.throws(() => checkRun({...run, event: 'push'}, 456, head), /does not belong/);
  const commit = {sha: testedSha, tree: {sha: tree}, parents: [{sha: base}, {sha: head}]};
  checkCandidate({sha: testedSha, validation}, pull, commit, base);
  assert.throws(() => checkCandidate({sha: testedSha, validation}, pull, commit, mergedSha), /changed/);
  assert.throws(() => checkCandidate({sha: testedSha, validation}, pull, {...commit, tree: {sha: head}}, base), /changed/);
});

test('failure summaries preserve relevant error context without credentials', () => {
  const log = ['ordinary progress', 'Traceback', 'AssertionError: wrong balance', 'token=secret123', 'Authorization: Bearer abcdefgh', 'github_pat_abcdefghi'].join('\n');
  const excerpt = errorExcerpt(log);
  assert.match(excerpt, /wrong balance/);
  assert.doesNotMatch(excerpt, /secret123|abcdefgh|github_pat_/);
  assert.equal(redact('custom-value', ['custom-value']), '[REDACTED]');
});

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'daoist-delivery-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const workspace = join(root, 'checkout');
  await mkdir(join(workspace, 'dist'), {recursive: true});
  await writeFile(join(workspace, 'dist', 'index.html'), 'validated content');
  const env = {...process.env, GITHUB_REPOSITORY: repository, GITHUB_WORKSPACE: workspace, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: testedSha, DAOIST_ARTIFACT_ROOT: join(root, 'store'), GITHUB_EVENT_PATH: join(root, 'event.json'), GITHUB_OUTPUT: join(root, 'output.txt'), GH_TOKEN: 'fake-test-token', HOME: root};
  const artifact = await save(context(env), 'daoist-riversoft-dist', Date.now(), validation);
  if (options.corrupt) await writeFile(join(artifact.directory, 'files', 'index.html'), 'corrupt');
  const state = {
    main: options.main || base, merged: false, conclusion: options.conclusion || 'success', head: options.head || head,
    publicationTree: options.publicationTree || tree, calls: [], requested: options.requested !== false,
  };
  await writeFile(join(root, 'state.json'), JSON.stringify(state));
  await writeFile(env.GITHUB_EVENT_PATH, JSON.stringify({workflow_run: run}));
  // A subprocess uses the real controller and filesystem but a closed fake
  // GitHub transport. An unexpected URL fails, never reaches the network.
  const preload = join(root, 'transport.mjs');
  await writeFile(preload, `
import {readFileSync,writeFileSync} from 'node:fs';
const file=${JSON.stringify(join(root, 'state.json'))};
const pull=${JSON.stringify(pull)},run=${JSON.stringify(run)};
globalThis.fetch=async(url,options={})=>{
 const s=JSON.parse(readFileSync(file,'utf8'));
 const path=new URL(url).pathname.replace('/repos/${repository}/','');
 const method=options.method||'GET';s.calls.push({path,method,body:options.body?JSON.parse(options.body):null});
 let value;
 if(path==='actions/workflows/ci.yml')value={id:456};
 else if(path==='actions/runs/123')value={...run,conclusion:s.conclusion};
 else if(path==='commits/${head}/statuses')value=s.requested?[{context:'daoist/delivery-request',state:'success',target_url:'https://github.com/${repository}/pull/53',creator:{login:'writer'}}]:[];
 else if(path==='collaborators/writer/permission')value={permission:'write'};
 else if(path==='statuses/${head}')value={};
 else if(path==='pulls/53'&&method==='GET')value={...pull,merged:s.merged,merge_commit_sha:s.merged?'${mergedSha}':null,head:{...pull.head,sha:s.head}};
 else if(path==='git/commits/${testedSha}')value={sha:'${testedSha}',tree:{sha:'${tree}'},parents:[{sha:'${base}'},{sha:'${head}'}]};
 else if(path==='git/ref/heads/main')value={object:{sha:s.main}};
 else if(path==='pulls/53/merge'&&method==='PUT'){s.merged=true;s.main='${mergedSha}';value={merged:true,sha:s.main};}
 else if(path==='git/commits/${mergedSha}')value={sha:'${mergedSha}',tree:{sha:s.publicationTree},parents:[{sha:'${base}'}]};
 else if(path==='actions/runs/123/attempts/1/jobs')value={jobs:[{id:99,name:'validate',conclusion:'failure',html_url:'https://github.com/${repository}/actions/runs/123',steps:[{name:'Browser tests',conclusion:'failure'}]}]};
 else if(path==='actions/jobs/99/logs')value='AssertionError: injected browser failure\\ntoken=private-test-secret';
 else if(path==='issues/53/comments')value=method==='GET'?[]:{};
 else throw Error('Unexpected test request: '+method+' '+path);
 writeFileSync(file,JSON.stringify(s));return new Response(typeof value==='string'?value:JSON.stringify(value),{status:200});
};
`);
  const invoke = action => spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, resolve('scripts/release.mjs'), action], {cwd: workspace, env: {...env, GITHUB_RUN_ID: '789', GITHUB_SHA: base}, encoding: 'utf8'});
  const stateNow = async () => JSON.parse(await readFile(join(root, 'state.json'), 'utf8'));
  return {invoke, stateNow, workspace, root, env};
}

test('controller restores tested bytes, squashes exact head, publishes once and returns success', async t => {
  const {invoke, stateNow, workspace} = await fixture(t);
  let process = invoke('prepare');
  assert.equal(process.status, 0, process.stderr);
  assert.equal(await readFile(join(workspace, 'dist', 'index.html'), 'utf8'), 'validated content');
  const calls = (await stateNow()).calls;
  assert.equal(calls.find(call => call.path === 'pulls/53/merge').body.sha, head);
  await mkdir(join(workspace, 'tools'));
  await mkdir(join(workspace, 'scripts'));
  await writeFile(join(workspace, 'tools', 'riversoft.mjs'), `import {appendFileSync} from 'node:fs'; if(process.argv[2]==='deploy'){appendFileSync('publications.txt','one\\n');console.log(JSON.stringify({url:'https://mevius.riversoft.top/daoist/',deploymentId:'test-deployment'}));}`);
  await writeFile(join(workspace, 'scripts', 'verify-public.mjs'), `console.log('All public hashes matched');`);
  process = invoke('publish');
  assert.equal(process.status, 0, process.stderr);
  process = invoke('publish');
  assert.equal(process.status, 0, process.stderr);
  assert.equal(await readFile(join(workspace, 'publications.txt'), 'utf8'), 'one\n');
  process = invoke('report');
  assert.equal(process.status, 0, process.stderr);
  assert.equal(JSON.parse(await readFile(join(workspace, 'artifacts', 'delivery-result.json'), 'utf8')).state, 'success');
  const statuses = (await stateNow()).calls.filter(call => call.path.startsWith('statuses/'));
  assert.equal(statuses.at(-1).body.state, 'success');
  process = invoke('prepare');
  assert.equal(process.status, 0, process.stderr);
  assert.equal((await stateNow()).calls.filter(call => call.path === 'pulls/53/merge').length, 1);
});

for (const [name, options] of [['corrupt bundle', {corrupt: true}], ['advanced main', {main: mergedSha}], ['new PR commit', {head: base}]]) {
  test(`${name} prevents merge and publication`, async t => {
    const {invoke, stateNow} = await fixture(t, options);
    const process = invoke('prepare');
    assert.equal(process.status, 1);
    assert(!(await stateNow()).calls.some(call => call.path === 'pulls/53/merge'));
  });
}

test('failed CI returns redacted error logs without merging', async t => {
  const {invoke, stateNow, workspace} = await fixture(t, {conclusion: 'failure'});
  assert.equal(invoke('prepare').status, 1);
  const process = invoke('report');
  assert.equal(process.status, 0, process.stderr);
  const result = JSON.parse(await readFile(join(workspace, 'artifacts', 'delivery-result.json'), 'utf8'));
  assert.equal(result.state, 'failure');
  assert.match(result.failedJobs[0].errorLog, /injected browser failure/);
  assert.doesNotMatch(result.failedJobs[0].errorLog, /private-test-secret/);
  assert(!(await stateNow()).calls.some(call => call.path === 'pulls/53/merge'));
});

test('post-merge content mismatch records merged status but blocks deployment', async t => {
  const {invoke, workspace} = await fixture(t, {publicationTree: head});
  assert.equal(invoke('prepare').status, 1);
  const result = JSON.parse(await readFile(join(workspace, 'artifacts', 'delivery-result.json'), 'utf8'));
  assert.equal(result.mergeSha, mergedSha);
  assert.equal(result.state, 'failure');
  await assert.rejects(readFile(join(workspace, 'artifacts', 'delivery-plan.json')), /ENOENT/);
});

test('ordinary PRs have no merge, deployment or comment side effects', async t => {
  const {invoke, stateNow} = await fixture(t, {requested: false});
  const process = invoke('prepare');
  assert.equal(process.status, 0, process.stderr);
  assert.equal((await stateNow()).calls.filter(call => call.method !== 'GET').length, 0);
});

test('publication errors return logs and an unknown remote outcome cannot be blindly retried', async t => {
  const {invoke, workspace} = await fixture(t);
  assert.equal(invoke('prepare').status, 0);
  await mkdir(join(workspace, 'tools'));
  await writeFile(join(workspace, 'tools', 'riversoft.mjs'), `if(process.argv[2]==='deploy'){console.error('Error: network disconnected after upload');process.exitCode=1;}`);
  assert.equal(invoke('publish').status, 1);
  let result = JSON.parse(await readFile(join(workspace, 'artifacts', 'delivery-result.json'), 'utf8'));
  assert.equal(result.stage, 'publish');
  assert.match(result.error, /network disconnected/);
  assert.equal(invoke('report').status, 0);
  assert.equal(invoke('prepare').status, 0);
  assert.equal(invoke('publish').status, 1);
  result = JSON.parse(await readFile(join(workspace, 'artifacts', 'delivery-result.json'), 'utf8'));
  assert.match(result.error, /outcome is unknown/);
});

test('a successful upload followed by failed public verification retries verification without another upload', async t => {
  const {invoke, workspace} = await fixture(t);
  assert.equal(invoke('prepare').status, 0);
  await mkdir(join(workspace, 'tools'));
  await mkdir(join(workspace, 'scripts'));
  await writeFile(join(workspace, 'tools', 'riversoft.mjs'), `import {appendFileSync} from 'node:fs';if(process.argv[2]==='deploy'){appendFileSync('publications.txt','one\\n');console.log(JSON.stringify({url:'https://mevius.riversoft.top/daoist/',deploymentId:'test-deployment'}));}`);
  await writeFile(join(workspace, 'scripts', 'verify-public.mjs'), `console.error('Error: hash mismatch');process.exitCode=1;`);
  assert.equal(invoke('publish').status, 1);
  let result = JSON.parse(await readFile(join(workspace, 'artifacts', 'delivery-result.json'), 'utf8'));
  assert.equal(result.stage, 'public-verification');
  assert.equal(result.deploymentId, 'test-deployment');
  assert.equal(invoke('prepare').status, 0);
  await writeFile(join(workspace, 'scripts', 'verify-public.mjs'), `console.log('All hashes matched');`);
  assert.equal(invoke('publish').status, 0);
  result = JSON.parse(await readFile(join(workspace, 'artifacts', 'delivery-result.json'), 'utf8'));
  assert.equal(result.state, 'success');
  assert.equal(await readFile(join(workspace, 'publications.txt'), 'utf8'), 'one\n');
});

test('command wrapper preserves failed exit codes and both output streams', async t => {
  const root = await mkdtemp(join(tmpdir(), 'daoist-step-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const result = spawnSync(process.execPath, [resolve('scripts/ci-step.mjs'), 'example', process.execPath, '-e', 'console.log("before");console.error("AssertionError: failure");process.exitCode=7'], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 7, result.stderr);
  const report = JSON.parse(await readFile(join(root, 'artifacts', 'ci', 'example.json'), 'utf8'));
  assert.equal(report.code, 7);
  assert.match(await readFile(join(root, 'artifacts', 'ci', 'example.log'), 'utf8'), /before/);
  assert.match(await readFile(join(root, 'artifacts', 'ci', 'example.log'), 'utf8'), /AssertionError/);
});
