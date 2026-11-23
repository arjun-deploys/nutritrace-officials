import { resolvePermissions, isWithinScope, type Permission, type Role } from '@nt/domain';
import type { MockError } from './ops';
import { mockError } from './ops';
import { DEMO_PASSWORD, PERSONAS } from './personas';
import { getStore } from './seed/simulate';
import type { DemoUser, TenantStore } from './store';

/**
 * A tiny in-browser API server. Routes mirror the production REST contract
 * (/api/v1/<service>/...) so the UI code is byte-for-byte the production UI.
 */
export interface Ctx {
  s: TenantStore;
  user: DemoUser;
  role: Role;
  permissions: Permission[];
  params: Record<string, string>;
  query: Record<string, string>;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  idempotencyKey?: string;
}
type Handler = (ctx: Ctx) => unknown;
interface Route { method: string; pattern: RegExp; keys: string[]; handler: Handler; permission?: Permission; public?: boolean }
const routes: Route[] = [];

export function route(method: string, path: string, handler: Handler, permission?: Permission, isPublic = false) {
  const keys: string[] = [];
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, pattern, keys, handler, permission, public: isPublic });
}

/* ── Session (the demo keeps it in sessionStorage; production uses an httpOnly cookie) ── */
const SESSION_KEY = 'nt-demo-persona';
const storage = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : undefined);
export const currentPersona = () => storage()?.getItem(SESSION_KEY) ?? undefined;
export const setPersona = (id?: string) => (id ? storage()?.setItem(SESSION_KEY, id) : storage()?.removeItem(SESSION_KEY));

export function sessionFor(personaId: string) {
  const p = PERSONAS.find((x) => x.id === personaId);
  if (!p) throw mockError(401, 'UNAUTHORIZED', 'Unknown demo user');
  const s = getStore(p.tenant);
  const user = s.users.find((u) => u.persona === p.id)!;
  return {
    accessToken: `demo.${p.id}`, expiresIn: 900,
    user: { id: user.id, name: user.name, username: user.username, role: user.role, permissions: resolvePermissions(user.role, s.tenant.config.access, user.customRoleId), tenantId: user.tenantId, geoPath: user.geoPath, facilityId: user.facilityId, facilityName: user.facilityName, scopeLabel: user.scopeLabel, mustChangePassword: false },
  };
}

route('POST', '/identity/auth/login', ({ body }) => {
  const p = PERSONAS.find((x) => x.username === String(body?.username ?? '').toLowerCase());
  if (!p || body?.password !== DEMO_PASSWORD) throw mockError(401, 'UNAUTHORIZED', 'Username or password is incorrect. In the demo, pick a person below.');
  setPersona(p.id);
  return sessionFor(p.id);
}, undefined, true);
route('POST', '/identity/auth/refresh', () => {
  const id = currentPersona();
  if (!id) throw mockError(401, 'UNAUTHORIZED', 'No demo session');
  return sessionFor(id);
}, undefined, true);
route('POST', '/identity/auth/logout', () => { setPersona(undefined); return undefined; }, undefined, true);

/* ── Helpers shared by route modules ── */
export const inScope = (ctx: Ctx, geoPath?: string | null) => !!geoPath && isWithinScope({ geoPath: ctx.user.geoPath }, geoPath);
export const facilityAllowed = (ctx: Ctx, facilityId: string) => !ctx.user.facilityId || ctx.user.facilityId === facilityId;
export const scopedGeo = (ctx: Ctx) => (ctx.query.geoPath && inScope(ctx, ctx.query.geoPath) ? ctx.query.geoPath : ctx.user.geoPath);
export const actor = (ctx: Ctx) => ({ userId: ctx.user.id, name: ctx.user.name, role: ctx.user.role });
export const includes = (v: string | undefined, q?: string) => !q || (v ?? '').toLowerCase().includes(q.toLowerCase());

const get = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o);
export function paginate<T>(rows: T[], q: Record<string, string>, defaultSort?: string) {
  const page = Math.max(1, Number(q.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 25)));
  const sort = q.sort ?? defaultSort;
  const dir = (q.order ?? 'desc') === 'asc' ? 1 : -1;
  const sorted = sort ? [...rows].sort((a, b) => {
    const x = get(a, sort) as string | number | undefined;
    const y = get(b, sort) as string | number | undefined;
    if (x === y) return 0;
    if (x === undefined || x === null) return 1;
    if (y === undefined || y === null) return -1;
    return (x < y ? -1 : 1) * dir;
  }) : rows;
  return { data: sorted.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: rows.length } };
}

/** Dispatch a request; returns [status, body, headers]. Used by MSW and by tests. */
export async function dispatch(method: string, path: string, opts: { query?: Record<string, string>; body?: unknown; auth?: string | null; idempotencyKey?: string }) {
  const sub = path.replace(/^\/api\/v1/, '');
  const r = routes.find((x) => x.method === method && x.pattern.test(sub));
  if (!r) return [404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${sub}` } }] as const;
  const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(sub.match(r.pattern)![i + 1]!)]));
  try {
    let ctx: Ctx;
    if (r.public) {
      ctx = { params, query: opts.query ?? {}, body: opts.body } as Ctx;
    } else {
      const token = opts.auth?.replace(/^Bearer /, '');
      if (!token?.startsWith('demo.')) throw mockError(401, 'UNAUTHORIZED', 'Sign in to continue');
      const persona = PERSONAS.find((p) => p.id === token.slice(5));
      if (!persona) throw mockError(401, 'UNAUTHORIZED', 'Sign in to continue');
      const s = getStore(persona.tenant);
      const user = s.users.find((u) => u.persona === persona.id)!;
      ctx = { s, user, role: user.role, permissions: resolvePermissions(user.role, s.tenant.config.access, user.customRoleId), params, query: opts.query ?? {}, body: opts.body, idempotencyKey: opts.idempotencyKey };
      if (r.permission && !ctx.permissions.includes(r.permission)) throw mockError(403, 'FORBIDDEN', 'You do not have permission for this action');
    }
    const result = await r.handler(ctx);
    if (result instanceof Response) return [result.status, result] as const;
    if (result === undefined) return [204, null] as const;
    const isEnvelope = typeof result === 'object' && result !== null && 'data' in result && 'meta' in result;
    return [method === 'POST' && !sub.includes('/auth/') && !sub.endsWith('/read') ? 201 : 200, isEnvelope ? result : { data: result }] as const;
  } catch (e) {
    const err = e as MockError;
    if (err.status) return [err.status, { error: { code: err.code, message: err.message, details: err.details, requestId: `demo-${Date.now().toString(36)}` } }] as const;
    console.error('[demo api]', method, sub, e);
    return [500, { error: { code: 'INTERNAL', message: `Demo server error: ${(e as Error).message}` } }] as const;
  }
}
