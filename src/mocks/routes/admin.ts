import {
  commodityCreateSchema, facilityCreateSchema, facilityImportRowSchema, geoUnitCreateSchema, isWithinScope, menuUpdateSchema, recipeSchema, supplierCreateSchema, vehicleCreateSchema,
  type CommodityDto, type FacilityDto, type FacilityImportResult, type SupplierDto, type VehicleDto,
} from '@nt/domain';
import { audit, conflict, forbidden, invalid, newId, notFound } from '../ops';
import { actor, inScope, route, type Ctx } from '../server';
import type { TenantStore } from '../store';

type Parser<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } };
const parse = <T,>(schema: Parser<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  return r.data;
};
const names = (s: TenantStore, geoPath: string) => {
  const parts = geoPath.split('/');
  const at = (lvl: number) => s.geo.find((g) => g.geoPath === parts.slice(0, lvl + 1).join('/'))?.name;
  return { districtName: at(1) ?? s.tenant.name, blockName: parts.length > 2 ? at(parts.length - 1) : undefined };
};
function upsertFacility(s: TenantStore, f: FacilityDto) {
  const i = s.facilities.findIndex((x) => x.id === f.id);
  if (i >= 0) s.facilities[i] = f; else s.facilities.push(f);
  s.facilityById.set(f.id, f);
  return f;
}

/* ── Locations ── */
route('POST', '/registry/geo-units', (ctx) => {
  const b = parse(geoUnitCreateSchema, ctx.body);
  const parent = ctx.s.geo.find((g) => g.id === b.parentId);
  if (!parent) throw notFound('Parent area');
  const levels = ctx.s.tenant.config.hierarchyLevels;
  if (parent.level + 1 >= levels.length) throw invalid(`${levels[parent.level]} is the lowest level configured`);
  const geoPath = `${parent.geoPath}/${b.code}`;
  if (ctx.s.geo.some((g) => g.geoPath === geoPath)) throw conflict('That code is already used here');
  const u = { id: `g-${geoPath}`, tenantId: ctx.s.tenant.id, code: b.code, name: b.name, level: parent.level + 1, levelName: levels[parent.level + 1]!, parentId: parent.id, geoPath };
  ctx.s.geo.push(u);
  audit(ctx.s, actor(ctx), 'registry.geo_created', { kind: 'GEO_UNIT', id: u.id, label: geoPath });
  return u;
}, 'master:manage');
route('PATCH', '/registry/geo-units/:id', (ctx) => {
  const u = ctx.s.geo.find((g) => g.id === ctx.params.id);
  if (!u) throw notFound('Area');
  const from = u.name;
  const name = String(ctx.body?.name ?? '').trim();
  if (name.length < 2) throw invalid('Enter the name');
  u.name = name;
  for (const f of ctx.s.facilities) if (f.geoPath === u.geoPath || f.geoPath.startsWith(`${u.geoPath}/`)) Object.assign(f, names(ctx.s, f.geoPath));
  audit(ctx.s, actor(ctx), 'registry.geo_renamed', { kind: 'GEO_UNIT', id: u.id, label: u.geoPath }, [{ field: 'name', from, to: name }]);
  return u;
}, 'master:manage');

/* ── Facilities ── */
route('POST', '/registry/facilities', (ctx) => {
  const b = parse(facilityCreateSchema, ctx.body);
  const geo = ctx.s.geo.find((g) => g.id === b.geoUnitId);
  if (!geo) throw notFound('Administrative area');
  if (ctx.s.facilities.some((f) => f.code === b.code)) throw conflict('A facility with this code already exists');
  if (b.type === 'SCHOOL' && !b.school) throw invalid('School details are required for a school');
  const f = upsertFacility(ctx.s, { ...b, id: newId(ctx.s), tenantId: ctx.s.tenant.id, geoPath: geo.geoPath, ...names(ctx.s, geo.geoPath), active: true } as FacilityDto);
  audit(ctx.s, actor(ctx), 'registry.facility_created', { kind: 'FACILITY', id: f.id, label: f.name });
  return f;
}, 'master:manage');
route('PATCH', '/registry/facilities/:id', (ctx) => {
  const f = ctx.s.facilityById.get(ctx.params.id!);
  if (!f) throw notFound('Facility');
  const b = parse(facilityCreateSchema.partial(), { ...ctx.body, active: undefined }) as Partial<FacilityDto>;
  const geo = b.geoUnitId ? ctx.s.geo.find((g) => g.id === b.geoUnitId) : undefined;
  const clean = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
  const next = { ...f, ...clean, code: f.code, type: f.type, ...(geo ? { geoUnitId: geo.id, geoPath: geo.geoPath, ...names(ctx.s, geo.geoPath) } : {}), active: (ctx.body as { active?: boolean }).active ?? f.active } as FacilityDto;
  upsertFacility(ctx.s, next);
  audit(ctx.s, actor(ctx), 'registry.facility_updated', { kind: 'FACILITY', id: f.id, label: next.name });
  return next;
}, 'master:manage');
route('POST', '/registry/facilities/import', (ctx) => {
  const s = ctx.s;
  const rows = (ctx.body?.rows ?? []) as Record<string, unknown>[];
  const dryRun = ctx.body?.dryRun !== false;
  const programmes = s.tenant.config.programmes.map((p) => p.code);
  const match = (u: { code: string; name: string }, key?: string) => !!key && (u.code.toLowerCase() === key.toLowerCase() || u.name.toLowerCase() === key.toLowerCase());
  const result: FacilityImportResult = { dryRun, total: rows.length, created: 0, updated: 0, errors: [] };
  const docs: FacilityDto[] = [];
  const seen = new Set<string>();
  rows.forEach((raw, i) => {
    const r = facilityImportRowSchema.safeParse(raw);
    const rowNo = i + 2;
    if (!r.success) return void result.errors.push({ row: rowNo, code: String(raw.code ?? ''), message: r.error.issues.map((x) => x.message).join('; ') });
    const row = r.data;
    if (seen.has(row.code)) return void result.errors.push({ row: rowNo, code: row.code, message: 'Duplicate code in file' });
    seen.add(row.code);
    const district = row.district ? s.geo.find((u) => u.level === 1 && match(u, row.district)) : undefined;
    if (row.district && !district) return void result.errors.push({ row: rowNo, code: row.code, message: `Unknown district "${row.district}"` });
    const block = row.block ? s.geo.find((u) => u.level === 2 && u.parentId === district?.id && match(u, row.block)) : undefined;
    if (row.block && !block) return void result.errors.push({ row: rowNo, code: row.code, message: `Unknown block "${row.block}" in ${district?.name}` });
    const geo = block ?? district ?? s.geo.find((u) => u.level === 0)!;
    if (!isWithinScope({ geoPath: ctx.user.geoPath }, geo.geoPath)) return void result.errors.push({ row: rowNo, code: row.code, message: 'Outside your area' });
    const progs = row.programmes ? row.programmes.split(/[;|]/).map((p) => p.trim()).filter(Boolean) : programmes;
    const unknown = progs.filter((p) => !programmes.includes(p));
    if (unknown.length) return void result.errors.push({ row: rowNo, code: row.code, message: `Unknown programme ${unknown.join(', ')}` });
    const existing = s.facilities.find((f) => f.code === row.code);
    docs.push({
      id: existing?.id ?? '', tenantId: s.tenant.id, code: row.code, name: row.name, type: row.type, geoUnitId: geo.id, geoPath: geo.geoPath, districtName: district?.name ?? s.tenant.name, blockName: block?.name,
      address: row.address, location: row.lat !== undefined && row.lng !== undefined ? { lat: row.lat, lng: row.lng } : existing?.location, inCharge: row.inChargeName ? { name: row.inChargeName, phone: row.inChargePhone } : existing?.inCharge,
      storageCapacityKg: row.capacityKg, active: true,
      school: row.type === 'SCHOOL' ? { udiseCode: row.udise!, category: row.category!, enrolment: row.enrolment!, hasKitchen: !/^(no|false)$/i.test(row.hasKitchen ?? 'yes'), programmes: progs } : undefined,
    });
    if (existing) result.updated++; else result.created++;
  });
  if (dryRun || result.errors.length) return { ...result, dryRun: true };
  for (const d of docs) upsertFacility(s, { ...d, id: d.id || newId(s) });
  audit(s, actor(ctx), 'registry.facility_imported', { kind: 'FACILITY_IMPORT', id: newId(s), label: `${docs.length} rows` }, [{ field: 'created', to: result.created }, { field: 'updated', to: result.updated }]);
  return result;
}, 'master:manage');

/* ── Commodities, suppliers, vehicles ── */
route('POST', '/registry/commodities', (ctx) => {
  const b = parse(commodityCreateSchema, ctx.body);
  if (ctx.s.commodities.some((c) => c.code === b.code)) throw conflict('That code is already used');
  const c = { ...b, id: `c-${b.code}`, tenantId: ctx.s.tenant.id, active: true } as CommodityDto;
  ctx.s.commodities.push(c);
  audit(ctx.s, actor(ctx), 'registry.commodity_created', { kind: 'COMMODITY', id: c.id, label: c.name });
  return c;
}, 'master:manage');
route('PATCH', '/registry/commodities/:id', (ctx) => {
  const c = ctx.s.commodities.find((x) => x.id === ctx.params.id);
  if (!c) throw notFound('Commodity');
  const { code: _code, unit: _unit, ...rest } = (ctx.body ?? {}) as Partial<CommodityDto>;
  Object.assign(c, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
  audit(ctx.s, actor(ctx), 'registry.commodity_updated', { kind: 'COMMODITY', id: c.id, label: c.name });
  return c;
}, 'master:manage');
route('POST', '/registry/suppliers', (ctx) => {
  const b = parse(supplierCreateSchema, ctx.body);
  if (ctx.s.suppliers.some((x) => x.code === b.code)) throw conflict('That supplier code is already used');
  const sup: SupplierDto = { ...b, id: newId(ctx.s), tenantId: ctx.s.tenant.id, status: 'PENDING_VERIFICATION', scorecard: { onTimePct: 0, inFullPct: 0, qualityPassPct: 0, lotsSupplied: 0 } };
  ctx.s.suppliers.push(sup);
  audit(ctx.s, actor(ctx), 'registry.supplier_registered', { kind: 'SUPPLIER', id: sup.id, label: sup.name });
  return sup;
}, 'supplier:manage');
route('PATCH', '/registry/suppliers/:id', (ctx) => {
  const sup = ctx.s.suppliers.find((x) => x.id === ctx.params.id);
  if (!sup) throw notFound('Supplier');
  const b = parse(supplierCreateSchema.omit({ code: true }).partial(), { ...ctx.body, code: undefined });
  Object.assign(sup, Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)));
  audit(ctx.s, actor(ctx), 'registry.supplier_updated', { kind: 'SUPPLIER', id: sup.id, label: sup.name });
  return sup;
}, 'supplier:manage');
route('POST', '/registry/vehicles', (ctx) => {
  const b = parse(vehicleCreateSchema, ctx.body);
  if (ctx.s.vehicles.some((v) => v.registrationNo === b.registrationNo)) throw conflict('That vehicle is already registered');
  const v: VehicleDto = { ...b, id: newId(ctx.s), tenantId: ctx.s.tenant.id, active: true };
  ctx.s.vehicles.push(v);
  return v;
}, 'shipment:create');
route('PATCH', '/registry/vehicles/:id', (ctx) => {
  const v = ctx.s.vehicles.find((x) => x.id === ctx.params.id);
  if (!v) throw notFound('Vehicle');
  Object.assign(v, ctx.body);
  if (v.active === false) ctx.s.vehicles = ctx.s.vehicles.filter((x) => x.id !== v.id);
  return v;
}, 'shipment:create');

/* ── Recipes and menus ── */
let recipeView: (ctx: Ctx, id: string) => unknown = () => undefined;
export const setRecipeView = (fn: typeof recipeView) => (recipeView = fn);
route('POST', '/meals/recipes', (ctx) => {
  const b = parse(recipeSchema, ctx.body);
  const latest = Math.max(0, ...ctx.s.recipes.filter((r) => r.code === b.code).map((r) => r.version));
  const r = { id: newId(ctx.s), code: b.code, name: b.name, mealType: b.mealType, description: b.description, version: latest + 1, status: 'DRAFT' as const, ingredients: b.ingredients };
  ctx.s.recipes.push(r);
  audit(ctx.s, actor(ctx), 'meals.recipe_drafted', { kind: 'RECIPE', id: r.id, label: `${r.code} v${r.version}` });
  return recipeView(ctx, r.id);
}, 'nutrition:manage');
route('PATCH', '/meals/recipes/:id', (ctx) => {
  const r = ctx.s.recipes.find((x) => x.id === ctx.params.id);
  if (!r) throw notFound('Recipe');
  if (r.status !== 'DRAFT') throw conflict('Approved recipes are locked. Create a new version instead.');
  const b = parse(recipeSchema.omit({ code: true }).partial(), { ...ctx.body, code: undefined });
  Object.assign(r, Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)));
  return recipeView(ctx, r.id);
}, 'nutrition:manage');
route('PUT', '/meals/menus/:code', (ctx) => {
  const b = parse(menuUpdateSchema, ctx.body);
  const codes = [...new Set(b.days.flatMap((d) => d.meals.map((m) => m.recipeCode)))];
  const missing = codes.filter((c) => !ctx.s.recipes.some((r) => r.code === c && r.status === 'APPROVED'));
  if (missing.length) throw invalid(`Approve these recipes first: ${missing.join(', ')}`);
  const existing = ctx.s.menus.find((m) => m.programmeCode === ctx.params.code);
  if (existing) existing.days = b.days; else ctx.s.menus.push({ programmeCode: ctx.params.code!, days: b.days });
  audit(ctx.s, actor(ctx), 'meals.menu_updated', { kind: 'MENU', id: ctx.params.code!, label: ctx.params.code });
  return ctx.s.menus.find((m) => m.programmeCode === ctx.params.code);
}, 'nutrition:manage');

/* ── Identity: profile and user edits ── */
route('GET', '/identity/auth/me', (ctx) => ({ ...ctx.user, permissions: ctx.permissions, mustChangePassword: false }));
route('PATCH', '/identity/users/:id', (ctx) => {
  const u = ctx.s.users.find((x) => x.id === ctx.params.id);
  if (!u) throw notFound('User');
  if (u.id === ctx.user.id && ((ctx.body.role && ctx.body.role !== u.role) || (ctx.body.status && ctx.body.status !== u.status))) throw forbidden('You cannot change your own role or status');
  if (ctx.body.geoPath && !inScope(ctx, ctx.body.geoPath)) throw forbidden('You can only assign areas inside your own');
  const f = ctx.body.facilityId ? ctx.s.facilityById.get(ctx.body.facilityId) : undefined;
  Object.assign(u, { role: ctx.body.role ?? u.role, geoPath: ctx.body.geoPath ?? u.geoPath, facilityId: ctx.body.facilityId, facilityName: f?.name, status: ctx.body.status ?? u.status });
  u.scopeLabel = [...u.geoPath.split('/').map((_, i, a) => ctx.s.geo.find((g) => g.geoPath === a.slice(0, i + 1).join('/'))?.name), f?.name].filter(Boolean).join(' › ');
  audit(ctx.s, actor(ctx), 'identity.user_updated', { kind: 'USER', id: u.id, label: u.username });
  return u;
}, 'user:manage');
