import { migrateSession } from './play';
import type { PlaySession } from './play';

const DB_NAME = 'daoist-delivery', STORE_NAME = 'saves';
const PREFIX = 'slot:', LEGACY_ID = 'legacy-autosave', IMPORT_MARKER = 'meta:legacy-import';
export interface SaveSlot {
  version: 1; id: string; name: string; createdAt: number; updatedAt: number; revision: number; session: PlaySession;
}
export interface SlotEntry extends Omit<SaveSlot, 'session'> { session: PlaySession | null; error?: string }
export class SaveConflictError extends Error {
  constructor() { super('此存档已在其他页面更新，已停止覆盖。请保留磁盘存档并重新读取。'); this.name = 'SaveConflictError'; }
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('存档数据库被其他页面占用。'));
  });
}
function decodeSlot(raw: unknown, id: string): SlotEntry {
  const invalid: SlotEntry = { version: 1, id, name: '无法读取的存档', createdAt: 0, updatedAt: 0, revision: 0, session: null, error: '版本不兼容或数据损坏，原存档未被覆盖。' };
  if (!raw || typeof raw !== 'object') return invalid;
  const r = raw as SaveSlot;
  if (r.version !== 1 || r.id !== id || !Number.isSafeInteger(r.revision) || r.revision < 1 || !Number.isFinite(r.createdAt) || !Number.isFinite(r.updatedAt)) return invalid;
  try {
    const session = migrateSession(r.session);
    return { ...invalid, name: typeof r.name === 'string' ? r.name.slice(0, 32) : '未命名仙途', createdAt: r.createdAt, updatedAt: r.updatedAt,
      revision: r.revision, session, error: session ? undefined : invalid.error };
  } catch { return invalid; }
}
/** The original autosave is an immutable backup. Slot + import marker are written atomically. */
export async function loadSlots(): Promise<SlotEntry[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite'), store = tx.objectStore(STORE_NAME);
      const values = store.getAll(), keys = store.getAllKeys();
      let entries: SlotEntry[] = [];
      keys.onsuccess = () => {
        try {
          const rows = new Map(keys.result.map((key, i) => [String(key), values.result[i]]));
          entries = [...rows].filter(([key]) => key.startsWith(PREFIX)).map(([key, value]) => decodeSlot(value, key.slice(PREFIX.length)));
          if (rows.has('autosave') && !rows.has(IMPORT_MARKER)) {
            let session: PlaySession | null = null;
            try { session = migrateSession(rows.get('autosave')); } catch { /* Preserve unreadable originals. */ }
            if (!rows.has(`${PREFIX}${LEGACY_ID}`) && session) {
              const now = Date.now();
              const slot: SaveSlot = { version: 1, id: LEGACY_ID, name: '旧存档 · 已兼容升级', createdAt: now, updatedAt: now, revision: 1, session };
              store.add(slot, `${PREFIX}${LEGACY_ID}`); entries.push(slot);
            } else if (!session && !rows.has(`${PREFIX}${LEGACY_ID}`)) {
              entries.push({ ...decodeSlot(null, LEGACY_ID), name: '旧存档 · 保留原件' });
            }
            if (session || rows.has(`${PREFIX}${LEGACY_ID}`)) store.put({ imported: true }, IMPORT_MARKER);
          }
        } catch (error) { tx.abort(); reject(error); }
      };
      tx.oncomplete = () => resolve(entries.sort((a, b) => b.updatedAt - a.updatedAt));
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
/** Optimistic revisions prevent a second tab or a delayed write from overwriting a newer save. */
export async function saveSlot(slot: SaveSlot, expectedRevision: number | null): Promise<SaveSlot> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite'), store = tx.objectStore(STORE_NAME);
      const key = `${PREFIX}${slot.id}`, request = store.get(key);
      const next = { ...slot, revision: (expectedRevision ?? 0) + 1 };
      let conflict = false, failure: unknown;
      request.onsuccess = () => {
        try {
          const previous = request.result === undefined ? null : decodeSlot(request.result, slot.id);
          if (expectedRevision === null ? previous !== null : !previous?.session || previous.revision !== expectedRevision || previous.session.play.mode !== slot.session.play.mode) {
            conflict = true; tx.abort(); return;
          }
          store.put(next, key);
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(conflict ? new SaveConflictError() : failure ?? tx.error);
    });
  } finally { db.close(); }
}
