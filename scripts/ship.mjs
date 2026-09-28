// Ordinary CLI orchestration: CI/release runs independently after submit exits.
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {gh, REPOSITORY, REQUEST_CONTEXT, RESULT_CONTEXT, checkPull, errorExcerpt, requestFor} from './delivery-lib.mjs';

const args = process.argv.slice(2), action = args.shift();
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const git = (...args) => execFileSync('git', args, {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024}).trim();
const api = path => JSON.parse(gh(['api', `repos/${REPOSITORY}/${path}`]));
const post = (path, fields) => gh(['api', '--method', 'POST', `repos/${REPOSITORY}/${path}`, ...Object.entries(fields).flatMap(([key, value]) => ['-f', `${key}=${value}`])]);

function npm(script) {
  if (!process.env.npm_execpath) throw Error('Use npm run ship -- submit ... so npm is resolved without a shell.');
  execFileSync(process.execPath, [process.env.npm_execpath, script === 'test' ? 'test' : 'run', ...(script === 'test' ? [] : [script])], {stdio: 'inherit'});
}

async function submit() {
  if (!/^(?:https:\/\/github\.com\/|git@github\.com:)meviu523\/daoist(?:\.git)?$/.test(git('remote', 'get-url', 'origin'))) throw Error('Unexpected origin repository.');
  const branch = git('branch', '--show-current');
  if (!branch || branch === 'main') throw Error('Submit from a feature branch.');
  // Validate the active credential only; an unrelated inactive account may
  // have an expired token and must not block this repository's delivery.
  gh(['api', 'user', '--jq', '.login']);
  // Only explicitly staged files are committed. No automatic add/stash/reset.
  if (git('diff', '--name-only')) throw Error('Unstaged tracked changes exist. Stage the intended files or use a clean worktree.');
  if (git('ls-files', '--others', '--exclude-standard')) throw Error('Untracked files exist. Stage intended files or use a clean worktree.');
  git('fetch', 'origin');
  // Fail before committing/pushing if this new controller is not installed yet.
  const controller = api('actions/workflows/release.yml');
  if (controller.state !== 'active') throw Error('Install release.yml on main before using automated delivery.');
  git('merge-base', '--is-ancestor', 'origin/main', 'HEAD');
  try { git('rev-parse', '--verify', `refs/remotes/origin/${branch}`); git('merge-base', '--is-ancestor', `origin/${branch}`, 'HEAD'); }
  catch (error) {
    if (git('branch', '-r', '--list', `origin/${branch}`)) throw Error('Remote feature branch diverged; reconcile it before submission.');
  }
  const changed = git('diff', '--name-only', 'origin/main');
  const staged = git('diff', '--cached', '--name-only');
  if (staged.split('\n').some(path => /(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example') || /^(?:artifacts|dist|node_modules)\//.test(path))) throw Error('Staged environment files or generated artifacts must not be committed.');
  const message = option('--message');
  if (staged && !message) throw Error('Staged changes require --message.');
  if (!changed && !staged) throw Error('No changes to submit.');
  npm('check'); npm('test'); npm('build');
  if (/^public\//m.test(changed) || /^tests\/(?:browser|ci-browser)/m.test(changed)) npm('test:browser');
  if (/^public\/(?:js\/(?:clock|map[^/]*|app|city[^/]*)\.js|[^/]+\.css)/m.test(changed)) npm('test:performance:dist');
  if (staged) git('commit', '-m', message);
  const headSha = git('rev-parse', 'HEAD');
  git('push', '--set-upstream', 'origin', branch);
  const prs = JSON.parse(gh(['pr', 'list', '--repo', REPOSITORY, '--head', branch, '--base', 'main', '--state', 'open', '--json', 'number,url']));
  let pr = prs[0];
  if (!pr) {
    const directory = await mkdtemp(join(tmpdir(), 'daoist-ship-'));
    try {
      const body = join(directory, 'body.md');
      const customBody = option('--body-file');
      await writeFile(body, customBody ? await readFile(customBody, 'utf8') : `${message || git('log', '-1', '--format=%s')}\n\nValidation: local source checks, Node tests and build passed; applicable browser checks passed. CI will verify the merged candidate before automatic delivery.\n`);
      gh(['pr', 'create', '--repo', REPOSITORY, '--base', 'main', '--head', branch, '--title', message || git('log', '-1', '--format=%s'), '--body-file', body]);
      pr = JSON.parse(gh(['pr', 'view', branch, '--repo', REPOSITORY, '--json', 'number,url']));
    } finally { await rm(directory, {recursive: true, force: true}); }
  }
  checkPull(api(`pulls/${pr.number}`), headSha);
  // A commit status is tied to this SHA and records the requesting user's
  // GitHub identity. Subsequent commits never inherit the release request.
  post(`statuses/${headSha}`, {context: REQUEST_CONTEXT, state: 'success', description: 'Explicit request: squash merge and deploy after strict CI', target_url: pr.url});
  post(`statuses/${headSha}`, {context: RESULT_CONTEXT, state: 'pending', description: 'Waiting for strict PR validation and automatic delivery', target_url: pr.url});
  // Handles the race where CI finished before the request was recorded.
  gh(['workflow', 'run', 'release.yml', '--repo', REPOSITORY, '--ref', 'main', '-f', `pr=${pr.number}`, '-f', `head_sha=${headSha}`]);
  console.log(JSON.stringify({pr: pr.number, headSha, url: pr.url, state: 'submitted', statusCommand: `npm run ship -- status ${pr.number}`}, null, 2));
  if (args.includes('--wait')) await waitFor(pr.number, headSha);
}

async function snapshot(number, expectedHead) {
  const pull = api(`pulls/${number}`);
  const head = expectedHead || pull.head.sha;
  const statuses = api(`commits/${head}/statuses?per_page=100`);
  const current = statuses.find(item => item.context === RESULT_CONTEXT);
  const request = requestFor(statuses, head);
  let result = {pr: number, headSha: head, state: current?.state || (request ? 'pending' : 'not-requested'), url: current?.target_url || pull.html_url, description: current?.description};
  if (current && current.state !== 'pending') {
    const comments = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${REPOSITORY}/issues/${number}/comments?per_page=100`])).flat();
    const comment = comments.findLast(item => item.user.login === 'github-actions[bot]' && item.body.startsWith(`<!-- daoist-delivery:${head} -->`));
    const match = /```json\n([\s\S]*?)\n```/.exec(comment?.body || '');
    if (match) result = JSON.parse(match[1]);
  }
  if (current?.state === 'pending' && /^https:\/\/github\.com\/meviu523\/daoist\/actions\/runs\/\d+$/.test(current.target_url)) {
    const id = current.target_url.split('/').at(-1), run = api(`actions/runs/${id}`);
    if (run.status === 'completed' && run.conclusion !== 'success') {
      result.state = run.conclusion;
      try { result.errorLog = errorExcerpt(gh(['run', 'view', id, '--repo', REPOSITORY, '--log-failed'])); }
      catch { result.errorLog = `Log retrieval unavailable; see ${current.target_url}`; }
    }
  }
  // Recover errors which happened before the controller could post a result
  // (checkout/setup failure, runner loss, missing permissions or cancellation).
  if (result.state === 'pending') {
    const runs = api('actions/workflows/release.yml/runs?per_page=100').workflow_runs;
    const release = runs.find(run => run.display_title === `Deliver ${head}` && (!request || !current?.created_at || run.created_at >= current.created_at));
    if (release?.status === 'completed' && release.conclusion !== 'success') {
      result = {...result, state: release.conclusion, url: release.html_url};
      try { result.errorLog = errorExcerpt(gh(['run', 'view', String(release.id), '--repo', REPOSITORY, '--log-failed'])); }
      catch { result.errorLog = `Log retrieval unavailable; see ${release.html_url}`; }
    }
  }
  if (pull.head.sha !== head && result.state === 'pending') result = {...result, state: 'superseded', description: 'PR has a newer commit; the old request is no longer eligible.'};
  return result;
}

async function waitFor(number, headSha) {
  const limit = Number(option('--timeout-minutes') || 60), end = Date.now() + limit * 60000;
  if (!Number.isFinite(limit) || limit <= 0 || limit > 240) throw Error('Timeout must be between 0 and 240 minutes.');
  headSha ||= api(`pulls/${number}`).head.sha;
  for (;;) {
    const result = await snapshot(number, headSha);
    if (result.state !== 'pending') {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.state === 'success' ? 0 : 1;
      return;
    }
    if (Date.now() >= end) {
      console.log(JSON.stringify({...result, state: 'wait-timeout', description: 'Client wait expired; the remote workflow continues. Use status to retrieve its result.'}, null, 2));
      process.exitCode = 2; return;
    }
    // This sleep and API query run in the CLI, without model calls or progress spam.
    await delay(60000);
  }
}

try {
  if (action === 'submit') await submit();
  else if (action === 'retry' && /^[1-9]\d*$/.test(args[0] || '')) {
    const pull = api(`pulls/${args[0]}`);
    checkPull(pull, pull.head.sha);
    const statuses = api(`commits/${pull.head.sha}/statuses?per_page=100`);
    if (requestFor(statuses, pull.head.sha)?.pr !== pull.number) throw Error('No active delivery request exists for this commit.');
    gh(['workflow', 'run', 'release.yml', '--repo', REPOSITORY, '--ref', 'main', '-f', `pr=${pull.number}`, '-f', `head_sha=${pull.head.sha}`]);
    console.log(JSON.stringify({pr: pull.number, headSha: pull.head.sha, state: 'retry-requested', url: pull.html_url}, null, 2));
  }
  else if (['status', 'wait'].includes(action) && /^[1-9]\d*$/.test(args[0] || '')) {
    if (action === 'wait') await waitFor(Number(args[0]));
    else console.log(JSON.stringify(await snapshot(Number(args[0])), null, 2));
  } else console.log('Stage intended files, then: npm run ship -- submit --message "..." [--body-file path] [--wait]\nRead result: npm run ship -- status <PR>\nWait quietly: npm run ship -- wait <PR> [--timeout-minutes 60]\nResume an existing request: npm run ship -- retry <PR>');
} catch (error) { console.error(error.message); process.exitCode = 1; }
