import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isApiError } from '@/lib/http';

/**
 * Field users (headmasters, kitchen staff) often lose signal. Submissions are
 * queued with an idempotency key and replayed when the connection returns;
 * the server deduplicates retries, so a report is never recorded twice.
 */
export interface QueuedSubmission {
  id: string; // also the Idempotency-Key
  kind: 'meal-service' | 'production' | 'receipt';
  label: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

type Sender = (s: QueuedSubmission) => Promise<unknown>;
const senders = new Map<QueuedSubmission['kind'], Sender>();
export const registerSender = (kind: QueuedSubmission['kind'], fn: Sender) => senders.set(kind, fn);

interface QueueState {
  items: QueuedSubmission[];
  flushing: boolean;
  enqueue: (s: Omit<QueuedSubmission, 'createdAt' | 'attempts'>) => void;
  remove: (id: string) => void;
  flush: () => Promise<{ sent: number; failed: number }>;
}

export const useOfflineQueue = create<QueueState>()(
  persist(
    (set, get) => ({
      items: [],
      flushing: false,
      enqueue: (s) => set((st) => ({ items: [...st.items, { ...s, createdAt: new Date().toISOString(), attempts: 0 }] })),
      remove: (id) => set((st) => ({ items: st.items.filter((i) => i.id !== id) })),
      flush: async () => {
        if (get().flushing || !navigator.onLine) return { sent: 0, failed: 0 };
        set({ flushing: true });
        let sent = 0;
        let failed = 0;
        for (const item of get().items) {
          const send = senders.get(item.kind);
          if (!send) continue;
          try {
            await send(item);
            get().remove(item.id);
            sent++;
          } catch (e) {
            // Validation/conflict errors will never succeed on retry: keep them visible for the user to fix.
            const permanent = isApiError(e) && e.status >= 400 && e.status < 500;
            set((st) => ({ items: st.items.map((i) => (i.id === item.id ? { ...i, attempts: i.attempts + 1, lastError: permanent ? (e as Error).message : undefined } : i)) }));
            failed++;
          }
        }
        set({ flushing: false });
        return { sent, failed };
      },
    }),
    { name: 'nt-offline-queue', partialize: (s) => ({ items: s.items }) },
  ),
);

export const newKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
