import { FACILITY_BOUND_ROLES, ROLE_LABELS, ROLE_PERMISSIONS, ROLES, tenantConfigSchema, userCreateSchema, type Role } from '@nt/domain';
import { audit, conflict, forbidden, invalid, newId, notFound } from '../ops';
import { actor, inScope, includes, paginate, route } from '../server';
import { stores } from '../store';

/* ── Registry ── */
route('GET', '/registry/tenants/current', ({ s }) => s.tenant);
route('GET', '/registry/tenants', () => [...stores.values()].map((s) => s.tenant), 'tenant:switch');
route('PATCH', '/registry/tenants/current/config', (ctx) => {
  const r = tenantConfigSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const before = ctx.s.tenant.config.thresholds;
  ctx.s.tenant.config = r.data;
  audit(ctx.s, actor(ctx), 'registry.tenant_config_updated', { kind: 'TENANT', id: ctx.s.tenant.id, label: ctx.s.tenant.name },
    Object.keys(before).filter((k) => before[k as keyof typeof before] !== r.data.thresholds[k as keyof typeof before]).map((k) => ({ field: `thresholds.${k}`, from: before[k as keyof typeof before], to: r.data.thresholds[k as keyof typeof before] })));
  return ctx.s.tenant;
}, 'config:manage');

route('GET', '/registry/geo-units', (ctx) => ctx.s.geo.filter((g) => inScope(ctx, g.geoPath) || ctx.user.geoPath.startsWith(g.geoPath)).filter((g) => !ctx.query.parentId || g.parentId === ctx.query.parentId));

route('GET', '/registry/facilities', (ctx) => {
  const q = ctx.query;
  const rows = ctx.s.facilities.filter((f) => inScope(ctx, f.geoPath) && (!q.type || f.type === q.type) && (!q.geoPath || f.geoPath.startsWith(q.geoPath))
    && (!q.q || includes(f.name, q.q) || includes(f.code, q.q) || f.school?.udiseCode === q.q));
  return paginate(rows, q, 'name');
}, 'master:read');
route('GET', '/registry/facilities/:id', (ctx) => {
  const f = ctx.s.facilityById.get(ctx.params.id!);
  if (!f) throw notFound('Facility');
  if (!inScope(ctx, f.geoPath) && !(ctx.user.facilityId && f.geoPath.startsWith(ctx.user.geoPath.split('/').slice(0, 2).join('/')))) throw forbidden('This record is outside your assigned area');
  return f;
});
route('GET', '/registry/commodities', ({ s }) => s.commodities);
route('GET', '/registry/suppliers', (ctx) => paginate(ctx.s.suppliers.filter((x) => (!ctx.query.status || x.status === ctx.query.status) && (includes(x.name, ctx.query.q) || includes(x.gstin, ctx.query.q))), ctx.query, 'name'));
route('GET', '/registry/suppliers/:id', (ctx) => ctx.s.suppliers.find((x) => x.id === ctx.params.id) ?? (() => { throw notFound('Supplier'); })());
route('POST', '/registry/suppliers/:id/status', (ctx) => {
  const sup = ctx.s.suppliers.find((x) => x.id === ctx.params.id);
  if (!sup) throw notFound('Supplier');
  if (ctx.body.status === 'APPROVED' && sup.fssaiValidUntil < new Date().toLocaleDateString('en-CA')) throw invalid('FSSAI licence has expired; renew it before approval');
  const from = sup.status;
  sup.status = ctx.body.status;
  audit(ctx.s, actor(ctx), `registry.supplier_${String(ctx.body.status).toLowerCase()}`, { kind: 'SUPPLIER', id: sup.id, label: sup.name }, [{ field: 'status', from, to: sup.status }]);
  return sup;
}, 'master:manage');
route('GET', '/registry/vehicles', ({ s }) => s.vehicles);

/* ── Identity ── */
route('GET', '/identity/roles', () => ROLES.map((r) => ({ role: r, label: ROLE_LABELS[r], permissions: ROLE_PERMISSIONS[r] })));
route('GET', '/identity/users', (ctx) => paginate(ctx.s.users.filter((u) => inScope(ctx, u.geoPath) && (!ctx.query.role || u.role === ctx.query.role) && (includes(u.name, ctx.query.q) || includes(u.username, ctx.query.q))), ctx.query, 'name'), 'user:manage');
route('POST', '/identity/users', (ctx) => {
  const r = userCreateSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const b = r.data;
  if (!inScope(ctx, b.geoPath)) throw forbidden('You can only create users inside your own area');
  if (FACILITY_BOUND_ROLES.includes(b.role) && !b.facilityId) throw conflict(`${ROLE_LABELS[b.role]} must be assigned to a facility`);
  if (ctx.s.users.some((u) => u.username === b.username)) throw conflict('That username is taken');
  const f = b.facilityId ? ctx.s.facilityById.get(b.facilityId) : undefined;
  const label = [...b.geoPath.split('/').map((_, i, a) => ctx.s.geo.find((g) => g.geoPath === a.slice(0, i + 1).join('/'))?.name), f?.name].filter(Boolean).join(' › ');
  const u = { id: newId(ctx.s), name: b.name, username: b.username, email: b.email || undefined, phone: b.phone || undefined, role: b.role as Role, status: 'ACTIVE' as const, tenantId: ctx.s.tenant.id, geoPath: b.geoPath, facilityId: b.facilityId, facilityName: f?.name, scopeLabel: label, mfaEnabled: false, createdAt: new Date().toISOString() };
  ctx.s.users.unshift(u);
  audit(ctx.s, actor(ctx), 'identity.user_created', { kind: 'USER', id: u.id, label: u.username }, [{ field: 'role', to: u.role }, { field: 'scope', to: label }]);
  return u;
}, 'user:manage');
route('POST', '/identity/users/:id/reset-password', (ctx) => {
  const u = ctx.s.users.find((x) => x.id === ctx.params.id);
  if (!u) throw notFound('User');
  audit(ctx.s, actor(ctx), 'identity.password_reset', { kind: 'USER', id: u.id, label: u.username });
  return { temporaryPassword: `Nt-${Math.random().toString(36).slice(2, 10)}9a`, role: u.role };
}, 'user:manage');
route('POST', '/identity/auth/change-password', () => ({ changed: true }));
