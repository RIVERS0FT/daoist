import {execFileSync} from 'node:child_process';

export const REPOSITORY = 'meviu523/daoist';
export const REQUEST_CONTEXT = 'daoist/delivery-request';
export const RESULT_CONTEXT = 'daoist/delivery';
export const shaPattern = /^[a-f0-9]{40}$/;

export function gh(args) {
  return execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024}).trim();
}

export class GitHub {
  constructor(token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN) { this.token = token; }
  async request(path, method = 'GET', body, raw = false) {
    if (!path.startsWith(`/repos/${REPOSITORY}/`)) throw Error('Unexpected GitHub repository.');
    const response = await fetch(`https://api.github.com${path}`, {
      method, headers: {Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28'},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
    return raw ? response.text() : response.status === 204 ? null : response.json();
  }
  get(path) { return this.request(`/repos/${REPOSITORY}/${path}`); }
  post(path, body) { return this.request(`/repos/${REPOSITORY}/${path}`, 'POST', body); }
  put(path, body) { return this.request(`/repos/${REPOSITORY}/${path}`, 'PUT', body); }
  patch(path, body) { return this.request(`/repos/${REPOSITORY}/${path}`, 'PATCH', body); }
  async pages(path) {
    const values = [];
    for (let page = 1; page <= 100; page++) {
      const batch = await this.get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw Error('Expected a GitHub list.');
      values.push(...batch);
      if (batch.length < 100) return values;
    }
    throw Error('GitHub pagination limit exceeded.');
  }
}

export function requestFor(statuses, headSha) {
  if (!shaPattern.test(headSha || '')) throw Error('Invalid requested commit.');
  const request = statuses.find(status => status.context === REQUEST_CONTEXT);
  const match = new RegExp(`^https://github.com/${REPOSITORY}/pull/([1-9]\\d*)$`).exec(request?.target_url || '');
  return request?.state === 'success' && match && request.creator?.login ? {pr: Number(match[1]), headSha, actor: request.creator.login} : null;
}

export function checkPull(pr, headSha) {
  if (pr.head.repo?.full_name !== REPOSITORY || pr.base.repo?.full_name !== REPOSITORY || pr.base.ref !== 'main' || pr.head.sha !== headSha || pr.draft || (pr.state !== 'open' && !pr.merged)) {
    throw Error('PR source, target or requested commit changed; submit a new delivery request.');
  }
}

export function checkRun(run, workflowId, headSha) {
  if (run.workflow_id !== workflowId || run.path !== '.github/workflows/ci.yml' || run.event !== 'pull_request' || run.head_repository?.full_name !== REPOSITORY || run.head_sha !== headSha) throw Error('CI does not belong to the requested PR commit.');
  return run.status === 'completed';
}

export function checkCandidate(meta, pr, commit, baseSha) {
  const evidence = meta.validation;
  if (!evidence || evidence.strict !== true || evidence.pr !== pr.number || evidence.headSha !== pr.head.sha || evidence.baseSha !== baseSha ||
      commit.sha !== meta.sha || commit.tree.sha !== evidence.treeSha || commit.parents?.length !== 2 ||
      commit.parents[0].sha !== baseSha || commit.parents[1].sha !== pr.head.sha) throw Error('Main or tested content changed; update the PR branch and run fresh CI before delivery.');
}

export function redact(text, secrets = []) {
  let value = String(text).replace(/\x1b\[[0-9;]*m/g, '');
  for (const secret of secrets.filter(item => item && item.length >= 8)) value = value.split(secret).join('[REDACTED]');
  return value.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g, '[REDACTED]')
    .replace(/(authorization\s*[:=]\s*(?:bearer|token)\s+)\S+/gi, '$1[REDACTED]')
    .replace(/((?:token|password|api[_-]?key|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

export function errorExcerpt(log, maxLines = 100) {
  const lines = redact(log).split(/\r?\n/);
  const index = lines.findIndex(line => /(?:not ok\b|Traceback|AssertionError|::error|Error:|FAILED|✖)/i.test(line));
  const from = index < 0 ? Math.max(0, lines.length - maxLines) : Math.max(0, index - 3);
  return lines.slice(from, from + maxLines).join('\n').slice(0, 14000);
}
