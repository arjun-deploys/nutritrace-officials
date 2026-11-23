import { dispatch } from './index';

/**
 * Write journal: every successful write is recorded and replayed after the
 * simulation on reload, so a refresh mid-pitch keeps everything the presenter did.
 * Ids are deterministic counters, so links stay valid after a replay.
 */
const KEY = 'nt-demo-journal';
interface Entry { method: string; path: string; query: Record<string, string>; body: unknown; auth: string | null; idem?: string; at: number }

const read = (): Entry[] => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Entry[]; } catch { return []; } };
export const journalSize = () => read().length;
export const clearJournal = () => sessionStorage.removeItem(KEY);
export function record(e: Omit<Entry, 'at'>) {
  if (e.path.includes('/auth/')) return;
  sessionStorage.setItem(KEY, JSON.stringify([...read(), { ...e, at: Date.now() }]));
}
export async function replay() {
  for (const e of read()) await dispatch(e.method, e.path, { query: e.query, body: e.body, auth: e.auth, idempotencyKey: e.idem });
}
