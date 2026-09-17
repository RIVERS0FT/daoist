import { isRecord } from './generation';
import { generationPayload } from './play';
import type { PlaySession } from './play';
import type { PlayMode } from './generation';

export interface AiSettings { endpoint: string; consent: boolean }
export type AiResult = { ok: true; data: unknown } | { ok: false; error: string };
export type Fetcher = typeof fetch;
const SETTINGS_KEY = 'daoist-delivery-ai-settings-v1';

export function normalizeRelayEndpoint(input: string): string {
  if (!input.trim()) return '';
  if (input.length > 2048) throw new Error('服务地址过长。');
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('请输入完整的 relay 服务地址。'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('线上服务必须使用 HTTPS；HTTP 仅允许本机开发地址。');
  if (url.username || url.password || url.search || url.hash) throw new Error('地址不能包含密钥、账号、查询参数或片段。口令请使用单独的临时输入框。');
  return url.href;
}
export function readAiSettings(defaultEndpoint = ''): AiSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    const value: unknown = stored ? JSON.parse(stored) : { endpoint: defaultEndpoint, consent: false };
    if (isRecord(value) && typeof value.endpoint === 'string') return { endpoint: normalizeRelayEndpoint(value.endpoint), consent: value.consent === true };
  } catch { /* Storage may be unavailable; consent must never default to true. */ }
  try { return { endpoint: normalizeRelayEndpoint(defaultEndpoint), consent: false }; } catch { return { endpoint: '', consent: false }; }
}
export function persistAiSettings(settings: AiSettings): boolean {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ endpoint: settings.endpoint, consent: settings.consent })); return true; } catch { return false; }
}

/** Cancels both fetch and the authority of any late promise from a previous session. */
export class RequestGate {
  private revision = 0;
  private controller: AbortController | null = null;
  begin() {
    this.cancel();
    this.controller = new AbortController();
    return { revision: this.revision, signal: this.controller.signal };
  }
  current(ticket: { revision: number; signal: AbortSignal }): boolean { return ticket.revision === this.revision && !ticket.signal.aborted; }
  cancel(): void { this.revision += 1; this.controller?.abort(); this.controller = null; }
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const limit = 32768;
  if (Number(response.headers.get('content-length') ?? 0) > limit) throw new Error('oversize');
  if (!response.body) throw new Error('empty');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error('aborted');
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('oversize');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
async function post(settings: AiSettings, token: string, body: unknown, outerSignal: AbortSignal, fetcher: Fetcher, timeoutMs: number): Promise<AiResult> {
  let endpoint: string;
  try { endpoint = normalizeRelayEndpoint(settings.endpoint); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : '无效服务地址。' }; }
  if (!endpoint) return { ok: false, error: '尚未配置 AI relay，已使用经典剧情。' };
  if (!settings.consent) return { ok: false, error: '尚未同意发送虚构场景，已使用经典剧情。' };
  if (outerSignal.aborted) return { ok: false, error: '请求已取消。' };
  const controller = new AbortController();
  const abort = () => controller.abort();
  outerSignal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetcher(endpoint, {
      method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `AI 服务返回 ${response.status}，已使用经典剧情。` };
    const data = await boundedJson(response, controller.signal);
    if (controller.signal.aborted) return { ok: false, error: 'AI 请求超时或取消，已使用经典剧情。' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: controller.signal.aborted ? 'AI 请求超时或取消，已使用经典剧情。' : 'AI 网络或返回格式异常，已使用经典剧情。' };
  } finally {
    clearTimeout(timeout); outerSignal.removeEventListener('abort', abort);
  }
}
export async function requestScene(s: PlaySession, settings: AiSettings, token: string, signal: AbortSignal, fetcher: Fetcher = fetch, timeoutMs = 20000): Promise<AiResult> {
  if (s.play.mode !== 'generative' || !s.play.pending) return { ok: false, error: '经典模式不发送 AI 请求。' };
  const result = await post(settings, token, generationPayload(s), signal, fetcher, timeoutMs);
  if (!result.ok) return result;
  if (!isRecord(result.data) || result.data.protocol !== 1 || !('scene' in result.data)) return { ok: false, error: '服务不支持 scene-v1 生成协议，已使用经典剧情。' };
  return { ok: true, data: result.data.scene };
}
export async function testAiConnection(mode: PlayMode, settings: AiSettings, token: string, signal: AbortSignal, fetcher: Fetcher = fetch): Promise<AiResult> {
  if (mode !== 'generative') return { ok: false, error: '请先切换至 AI 生成模式。' };
  const result = await post(settings, token, { protocol: 1, type: 'health' }, signal, fetcher, 7000);
  if (!result.ok) return result;
  if (!isRecord(result.data) || result.data.protocol !== 1 || result.data.ready !== true || !Array.isArray(result.data.capabilities) || !result.data.capabilities.includes('scene-v1')) return { ok: false, error: 'relay 尚未配置模型，或不支持 scene-v1。' };
  return { ok: true, data: null };
}
