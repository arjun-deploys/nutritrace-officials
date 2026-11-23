import { useAuthStore } from '@/stores/auth';

/**
 * Typed fetch wrapper for the /api/v1 gateway.
 * - attaches the in-memory access token
 * - on 401, performs one single-flight refresh (httpOnly cookie) and retries
 * - unwraps `{ data }` / `{ data, meta }` envelopes; turns error bodies into ApiError
 */
export type ApiError = Error & { status: number; code: string; details?: unknown; requestId?: string };

export const isApiError = (e: unknown): e is ApiError => e instanceof Error && 'status' in e && 'code' in e;

function apiError(status: number, code: string, message: string, details?: unknown, requestId?: string): ApiError {
  return Object.assign(new Error(message), { status, code, details, requestId });
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

const BASE = '/api/v1';
let refreshing: Promise<boolean> | null = null;

export function buildUrl(path: string, query?: RequestOptions['query']) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return `${BASE}${path}${s ? `?${s}` : ''}`;
}

async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/identity/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const { data } = await res.json();
      useAuthStore.getState().setSession(data.accessToken, data.user);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

async function send(path: string, opts: RequestOptions, retry = true): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET', headers, credentials: 'include', signal: opts.signal,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw apiError(0, 'NETWORK', 'Cannot reach the server. Check the connection and try again.');
  }
  if (res.status === 401 && retry && !path.startsWith('/identity/auth/')) {
    if (await refreshSession()) return send(path, opts, false);
    useAuthStore.getState().clear();
  }
  return res;
}

async function parse(res: Response) {
  if (res.status === 204) return { data: undefined };
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw apiError(res.status, e.code ?? 'HTTP_ERROR', e.message ?? `Request failed (${res.status})`, e.details, e.requestId);
  }
  return body as { data: unknown; meta?: unknown };
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await parse(await send(path, opts))).data as T;
}

export async function requestPage<T>(path: string, opts: RequestOptions = {}) {
  const body = await parse(await send(path, opts));
  return body as { data: T[]; meta: { page: number; pageSize: number; total: number } };
}

/** Download a file endpoint (CSV exports) with auth applied. */
export async function download(path: string, query: RequestOptions['query'], fallbackName: string) {
  const res = await send(path, { query });
  if (!res.ok) await parse(res);
  const blob = await res.blob();
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function restoreSession() {
  return refreshSession();
}
