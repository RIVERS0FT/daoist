// Executed from main by workflow_run, never from a PR checkout.
import {appendFile, lstat, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {context, inspect, restoreValidated, safeDirectory} from './runner-artifacts.mjs';
import {GitHub, REPOSITORY, RESULT_CONTEXT, checkCandidate, checkPull, checkRun, errorExcerpt, redact, requestFor, shaPattern} from './delivery-lib.mjs';

const api = new GitHub();
const resultFile = 'artifacts/delivery-result.json';
const planFile = 'artifacts/delivery-plan.json';
const runUrl = `https://github.com/${REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const secretValues = [process.env.GH_TOKEN, process.env.GITHUB_TOKEN, process.env.RIVERSOFT_TOKEN];
let result;
async function ledgerPath(headSha) {
  if (!shaPattern.test(headSha)) throw Error('Invalid delivery identity.');
  const directory = join(context().store, 'deliveries');
  await safeDirectory(directory, true);
  const file = join(directory, `${headSha}.json`);
  const info = await lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (info && (!info.isFile() || info.isSymbolicLink())) throw Error('Redirected delivery record.');
  return file;
}
const persist = async () => {
  await mkdir('artifacts', {recursive: true});
  await writeFile(resultFile, JSON.stringify(result, null, 2) + '\n');
  const ledger = await ledgerPath(result.headSha);
  const temporary = `${ledger}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(result, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  await rename(temporary, ledger);
};
const output = async (name, value) => {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};
const status = (headSha, state, description) => api.post(`statuses/${headSha}`, {state, context: RESULT_CONTEXT, description: description.slice(0, 140), target_url: runUrl});

async function prepare() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const workflow = await api.get('actions/workflows/ci.yml');
  let run = event.workflow_run;
  if (!run) {
    const {pr, head_sha: headSha} = event.inputs || {};
    if (!/^[1-9]\d*$/.test(pr || '') || !shaPattern.test(headSha || '')) throw Error('Invalid manual delivery request.');
    const pull = await api.get(`pulls/${pr}`);
    checkPull(pull, headSha);
    const runs = await api.get(`actions/workflows/${workflow.id}/runs?event=pull_request&head_sha=${headSha}&per_page=10`);
    run = runs.workflow_runs[0];
    if (!run || run.status !== 'completed') {
      console.log('CI is still pending. Its completion event will resume delivery.');
      return;
    }
  }
  // Re-fetch the current attempt: an old completed event must not release a
  // different attempt which is still running, or an outdated PR revision.
  run = await api.get(`actions/runs/${run.id}`);
  if (!checkRun(run, workflow.id, run.head_sha)) return;
  const statuses = await api.pages(`commits/${run.head_sha}/statuses`);
  const request = requestFor(statuses, run.head_sha);
  if (!request) { console.log('No delivery request for this commit.'); return; }
  const permission = await api.get(`collaborators/${encodeURIComponent(request.actor)}/permission`);
  if (!['admin', 'maintain', 'write'].includes(permission.permission)) throw Error('Delivery was not requested by a repository writer.');
  const previous = statuses.find(item => item.context === RESULT_CONTEXT);
  if (previous?.state === 'success') { console.log('This commit was already delivered.'); return; }
  result = {schema: 1, repository: REPOSITORY, pr: request.pr, headSha: request.headSha, ciRunId: run.id, ciAttempt: run.run_attempt, runUrl, state: 'pending', stage: 'validation', startedAt: new Date().toISOString()};
  const prior = await readFile(await ledgerPath(request.headSha), 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (prior) {
    if (prior.headSha !== request.headSha || prior.pr !== request.pr || prior.repository !== REPOSITORY) throw Error('Delivery record identity mismatch.');
    for (const key of ['publishStarted', 'url', 'deploymentId', 'mergeSha']) if (prior[key]) result[key] = prior[key];
    result.previousRunUrl = prior.runUrl;
    if (prior.state === 'success') { result = {...prior, runUrl}; await persist(); return; }
  }
  await persist();
  await status(request.headSha, 'pending', 'Checking CI, merge content and saved bundle');
  const pull = await api.get(`pulls/${request.pr}`);
  checkPull(pull, request.headSha);
  if (run.conclusion !== 'success') {
    result.state = ['cancelled', 'timed_out'].includes(run.conclusion) ? run.conclusion : 'failure';
    result.error = `CI ${run.conclusion}; merge and deployment were not started.`;
    const jobs = await api.get(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
    result.failedJobs = jobs.jobs.filter(job => ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(job.conclusion)).map(job => ({id: job.id, name: job.name, conclusion: job.conclusion, url: job.html_url, steps: job.steps.filter(step => step.conclusion === 'failure').map(step => step.name)}));
    for (const job of result.failedJobs.slice(0, 3)) {
      try {
        const log = await api.request(`/repos/${REPOSITORY}/actions/jobs/${job.id}/logs`, 'GET', undefined, true);
        await writeFile(`artifacts/ci-job-${job.id}.log`, redact(log, secretValues));
        job.errorLog = errorExcerpt(redact(log, secretValues));
      } catch (error) { job.errorLog = `${error.message}; full logs: ${job.url}`; }
    }
    await persist();
    throw Error(result.error);
  }
  const ctx = context();
  const key = `${run.id}-${run.run_attempt}-daoist-riversoft-dist`;
  result.stage = 'artifact';
  await persist();
  const {meta} = await inspect(ctx, key);
  const tested = await api.get(`git/commits/${meta.sha}`);
  const main = await api.get('git/ref/heads/main');
  let baseSha = main.object.sha;
  if (pull.merged) {
    if (main.object.sha !== pull.merge_commit_sha) throw Error('A newer main revision exists; refusing to deploy an older release.');
    const merged = await api.get(`git/commits/${pull.merge_commit_sha}`);
    baseSha = merged.parents[0].sha;
  }
  checkCandidate(meta, pull, tested, baseSha);
  await restoreValidated(ctx, key, {runId: run.id, attempt: run.run_attempt, sha: meta.sha, validation: meta.validation});
  result.stage = 'merge';
  await persist();
  // Refresh both refs immediately before the merge. The merge API also checks
  // the expected head. A concurrent human base update is caught by the tree
  // check after merging, before any deployment.
  checkPull(await api.get(`pulls/${pull.number}`), request.headSha);
  if ((await api.get('git/ref/heads/main')).object.sha !== main.object.sha) throw Error('Main changed while preparing release; fresh CI is required.');
  let mergeSha = pull.merge_commit_sha;
  if (!pull.merged) {
    const merged = await api.put(`pulls/${pull.number}/merge`, {sha: request.headSha, merge_method: 'squash'});
    if (!merged.merged) throw Error('GitHub did not merge the PR.');
    mergeSha = merged.sha;
  }
  result.mergeSha = mergeSha;
  await persist();
  const mergedCommit = await api.get(`git/commits/${mergeSha}`);
  if (mergedCommit.tree.sha !== meta.validation.treeSha || (await api.get('git/ref/heads/main')).object.sha !== mergeSha) throw Error('Merged content differs from validated content; deployment blocked.');
  await writeFile(planFile, JSON.stringify({key, mergeSha, headSha: request.headSha, treeSha: mergedCommit.tree.sha, pr: pull.number}, null, 2) + '\n');
  result.stage = 'publish';
  await persist();
  await output('deploy', 'true');
}

async function command(name, args) {
  await mkdir('artifacts/ci', {recursive: true});
  let text = '';
  const child = spawn(process.execPath, args, {stdio: ['ignore', 'pipe', 'pipe']});
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { text += chunk; process.stdout.write(chunk); });
  child.on('error', error => { text += error.message; });
  const code = await new Promise(resolve => child.on('close', code => resolve(code ?? 1)));
  await writeFile(`artifacts/ci/${name}.log`, redact(text, secretValues));
  if (code) throw Error(`${name} failed (exit ${code}).\n${errorExcerpt(redact(text, secretValues))}`);
  return text;
}

async function publish() {
  result = JSON.parse(await readFile(resultFile, 'utf8'));
  const plan = JSON.parse(await readFile(planFile, 'utf8'));
  if ((await api.get('git/ref/heads/main')).object.sha !== plan.mergeSha) throw Error('Main advanced; refusing to publish an older bundle.');
  await command('bundle', ['tools/riversoft.mjs', 'check', './dist']);
  if (result.publishStarted && !result.deploymentId) throw Error(`Previous publication outcome is unknown. Inspect ${result.previousRunUrl || runUrl} before retrying; automatic duplicate publication is blocked.`);
  let publication = {url: result.url, deploymentId: result.deploymentId};
  if (!result.deploymentId) {
    result.publishStarted = new Date().toISOString();
    await persist();
    publication = JSON.parse(await command('publish', ['tools/riversoft.mjs', 'deploy', './dist', '--slug', 'daoist', '--title', '外卖修仙录', '--description', '白天送达一份热饭，入夜寻一条自己的仙途。', '--kind', 'game', '--visibility', 'public', '--yes']));
  }
  const url = new URL(publication.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.riversoft.top') || url.pathname !== '/daoist/' || !publication.deploymentId) throw Error('Unexpected publication identity.');
  result.url = url.href;
  result.deploymentId = publication.deploymentId;
  result.stage = 'public-verification';
  await persist();
  await command('public-verification', ['scripts/verify-public.mjs', './dist', result.url, result.deploymentId]);
  result.state = 'success';
  result.stage = 'complete';
  await persist();
}

async function report() {
  try { result = JSON.parse(await readFile(resultFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (result.state === 'pending') {
    result.state = process.env.JOB_STATUS === 'cancelled' ? 'cancelled' : 'failure';
    result.error ||= `Release stopped at ${result.stage}; see ${runUrl}`;
  }
  result.finishedAt = new Date().toISOString();
  result.reportDirectory = `${process.env.HOME}/.local/state/daoist-actions/${REPOSITORY}/${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  await persist();
  const marker = `<!-- daoist-delivery:${result.headSha} -->`;
  const summary = `${marker}\nDelivery **${result.state}** · stage: ${result.stage}\n\nCommit: \`${result.headSha}\`\n\n[Workflow and full logs](${runUrl})${result.url ? ` · [Published site](${result.url})` : ''}\n\n${result.error || 'Public files matched the validated bundle.'}\n\n`;
  const body = redact(`${summary}<details><summary>delivery-result.json and error logs</summary>\n\n\`\`\`json\n${JSON.stringify(result, null, 2).replaceAll('```', "'''")}\n\`\`\`\n</details>`, secretValues);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, body + '\n');
  const comments = await api.pages(`issues/${result.pr}/comments`);
  const existing = comments.find(comment => comment.user.login === 'github-actions[bot]' && comment.body.startsWith(marker));
  if (existing) await api.patch(`issues/comments/${existing.id}`, {body});
  else await api.post(`issues/${result.pr}/comments`, {body});
  await status(result.headSha, result.state === 'success' ? 'success' : 'failure', `${result.state}: ${result.stage}`);
  console.log(JSON.stringify(result, null, 2));
}

try {
  const task = process.argv[2];
  if (task === 'prepare') await prepare();
  else if (task === 'publish') await publish();
  else if (task === 'report') await report();
  else throw Error('Usage: release.mjs prepare|publish|report');
} catch (error) {
  if (result) {
    if (result.state === 'pending') result.state = 'failure';
    result.error = redact(error.message, secretValues);
    await persist();
  }
  console.error(redact(error.stack || error.message, secretValues));
  process.exitCode = 1;
}
