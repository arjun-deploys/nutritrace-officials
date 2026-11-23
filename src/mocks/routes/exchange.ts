import {
  commodityImportRowSchema, EXCHANGE, FACILITY_BOUND_ROLES, isWithinScope, locationImportRowSchema, ROLE_LABELS, supplierImportRowSchema, tenantConfigSchema, toCsv,
  userImportRowSchema, vehicleImportRowSchema, type ExchangeEntity, type ImportResult, type Role,
} from '@nt/domain';
import { audit, invalid, newId } from '../ops';
import { actor, dispatch, inScope, route, type Ctx } from '../server';

const csvResponse = (name: string, text: string) => new Response(`\uFEFF${text}`, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` } });
const issues = (e: { issues: { message: string }[] }) => e.issues.map((i) => i.message).join('; ');
const match = (u: { code: string; name: string }, key?: string) => !!key && (u.code.toLowerCase() === key.toLowerCase() || u.name.toLowerCase() === key.toLowerCase());
const today = () => new Date().toLocaleDateString('en-CA');

function importEntity(ctx: Ctx, entity: Exclude<ExchangeEntity, 'facilities' | 'users'>, rows: Record<string, unknown>[], dryRun: boolean): ImportResult {
  const s = ctx.s;
  const errors: ImportResult['errors'] = [];
  const ops: { exists: boolean; apply: () => void }[] = [];
  const seen = new Set<string>();
  const pendingUnits: typeof s.geo = [];
  rows.forEach((raw, i) => {
    const row = i + 2;
    const fail = (code: string, message: string) => void errors.push({ row, code, message });
    if (entity === 'locations') {
      const r = locationImportRowSchema.safeParse(raw);
      if (!r.success) return fail(String(raw.code ?? ''), issues(r.error));
      const parent = [...s.geo, ...pendingUnits].find((u) => match(u, r.data.parent));
      if (!parent) return fail(r.data.code, `Unknown parent "${r.data.parent}" (list higher levels first)`);
      const levels = s.tenant.config.hierarchyLevels;
      if (parent.level + 1 >= levels.length) return fail(r.data.code, `${levels[parent.level]} is the lowest level`);
      if (!inScope(ctx, parent.geoPath) && parent.geoPath !== ctx.user.geoPath) return fail(r.data.code, 'Outside your area');
      const geoPath = `${parent.geoPath}/${r.data.code}`;
      if (seen.has(geoPath)) return fail(r.data.code, 'Duplicate in file');
      seen.add(geoPath);
      const existing = s.geo.find((u) => u.geoPath === geoPath);
      const unit = existing ?? { id: `g-${geoPath}`, tenantId: s.tenant.id, code: r.data.code, name: r.data.name, level: parent.level + 1, levelName: levels[parent.level + 1]!, parentId: parent.id, geoPath };
      if (!existing) pendingUnits.push(unit);
      ops.push({ exists: !!existing, apply: () => { unit.name = r.data.name; if (!existing) s.geo.push(unit); } });
    } else if (entity === 'suppliers') {
      const r = supplierImportRowSchema.safeParse(raw);
      if (!r.success) return fail(String(raw.code ?? ''), issues(r.error));
      const d = r.data;
      if (seen.has(d.code)) return fail(d.code, 'Duplicate in file');
      seen.add(d.code);
      const codes = d.commodities.split(/[;|]/).map((c) => c.trim().toUpperCase()).filter(Boolean);
      const missing = codes.filter((c) => !s.commodities.some((x) => x.code === c));
      if (missing.length) return fail(d.code, `Unknown product code ${missing.join(', ')}`);
      const existing = s.suppliers.find((x) => x.code === d.code);
      const set = { name: d.name, gstin: d.gstin, fssaiLicence: d.fssaiLicence, fssaiValidUntil: d.fssaiValidUntil, commodityIds: codes.map((c) => `c-${c}`), contact: { name: d.contactName, phone: d.contactPhone, email: d.contactEmail ?? '' }, address: d.address ?? '' };
      ops.push({ exists: !!existing, apply: () => { if (existing) Object.assign(existing, set); else s.suppliers.push({ ...set, id: newId(s), tenantId: s.tenant.id, code: d.code, status: 'PENDING_VERIFICATION', scorecard: { onTimePct: 0, inFullPct: 0, qualityPassPct: 0, lotsSupplied: 0 } }); } });
    } else if (entity === 'commodities') {
      const r = commodityImportRowSchema.safeParse(raw);
      if (!r.success) return fail(String(raw.code ?? ''), issues(r.error));
      const d = r.data;
      if (seen.has(d.code)) return fail(d.code, 'Duplicate in file');
      seen.add(d.code);
      const existing = s.commodities.find((c) => c.code === d.code);
      if (existing && existing.unit !== d.unit) return fail(d.code, `unit cannot change (is ${existing.unit})`);
      const set = { name: d.name, category: d.category, unit: d.unit, shelfLifeDays: d.shelfLifeDays, gramsPerUnit: d.gramsPerUnit, nutritionSource: d.nutritionSource ?? '', nutritionPer100: { energyKcal: d.energyKcal, proteinG: d.proteinG, fatG: d.fatG, carbsG: d.carbsG, ironMg: d.ironMg, calciumMg: d.calciumMg } };
      ops.push({ exists: !!existing, apply: () => { if (existing) Object.assign(existing, set); else s.commodities.push({ ...set, id: `c-${d.code}`, tenantId: s.tenant.id, code: d.code, active: true } as never); } });
    } else {
      const r = vehicleImportRowSchema.safeParse(raw);
      if (!r.success) return fail(String(raw.registrationNo ?? ''), issues(r.error));
      const d = r.data;
      if (seen.has(d.registrationNo)) return fail(d.registrationNo, 'Duplicate in file');
      seen.add(d.registrationNo);
      const existing = s.vehicles.find((v) => v.registrationNo === d.registrationNo);
      const set = { transporterName: d.transporterName, capacityKg: d.capacityKg, gpsDeviceId: d.gpsDeviceId, driver: { name: d.driverName, phone: d.driverPhone }, active: true };
      ops.push({ exists: !!existing, apply: () => { if (existing) Object.assign(existing, set); else s.vehicles.push({ ...set, id: newId(s), tenantId: s.tenant.id, registrationNo: d.registrationNo }); } });
    }
  });
  const result: ImportResult = { entity, dryRun: dryRun || errors.length > 0, total: rows.length, created: ops.filter((o) => !o.exists).length, updated: ops.filter((o) => o.exists).length, errors };
  if (result.dryRun) return result;
  ops.forEach((o) => o.apply());
  audit(s, actor(ctx), `${entity}.imported`, { kind: 'IMPORT', id: newId(s), label: `${EXCHANGE[entity].label}: ${ops.length} rows` }, [{ field: 'created', to: result.created }, { field: 'updated', to: result.updated }]);
  return result;
}

route('POST', '/registry/import/:entity', async (ctx) => {
  const entity = ctx.params.entity as ExchangeEntity;
  const rows = (ctx.body?.rows ?? []) as Record<string, unknown>[];
  const dryRun = ctx.body?.dryRun !== false;
  if (entity === 'facilities') {
    const [, res] = await dispatch('POST', '/api/v1/registry/facilities/import', { body: { rows, dryRun }, auth: `Bearer demo.${ctx.user.persona}` });
    const r = (res as { data?: ImportResult; error?: { message: string } });
    if (!r.data) throw invalid(r.error?.message ?? 'Import failed');
    return { ...r.data, entity: 'facilities' };
  }
  if (!['locations', 'suppliers', 'commodities', 'vehicles'].includes(entity)) throw invalid('Unknown entity');
  return importEntity(ctx, entity as 'locations', rows, dryRun);
}, 'data:import');

route('GET', '/registry/export/:entity', (ctx) => {
  const s = ctx.s;
  const entity = ctx.params.entity as ExchangeEntity;
  let rows: Record<string, unknown>[] = [];
  if (entity === 'locations') rows = s.geo.filter((u) => u.level > 0 && (inScope(ctx, u.geoPath) || ctx.user.geoPath.startsWith(u.geoPath))).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).map((u) => ({ code: u.code, name: u.name, parent: s.geo.find((p) => p.id === u.parentId)?.code ?? s.tenant.id, level: u.levelName }));
  if (entity === 'facilities') rows = s.facilities.filter((f) => inScope(ctx, f.geoPath)).map((f) => ({ code: f.code, name: f.name, type: f.type, district: f.districtName, block: f.blockName, udise: f.school?.udiseCode, category: f.school?.category, enrolment: f.school?.enrolment, hasKitchen: f.school ? (f.school.hasKitchen ? 'yes' : 'no') : '', programmes: f.school?.programmes.join(';'), address: f.address, lat: f.location?.lat, lng: f.location?.lng, inChargeName: f.inCharge?.name, inChargePhone: f.inCharge?.phone, capacityKg: f.storageCapacityKg, active: f.active ? 'yes' : 'no' }));
  if (entity === 'suppliers') rows = s.suppliers.map((x) => ({ code: x.code, name: x.name, gstin: x.gstin, fssaiLicence: x.fssaiLicence, fssaiValidUntil: x.fssaiValidUntil, commodities: x.commodityIds.map((c) => c.replace('c-', '')).join(';'), contactName: x.contact.name, contactPhone: x.contact.phone, contactEmail: x.contact.email, address: x.address, status: x.status }));
  if (entity === 'commodities') rows = s.commodities.map((c) => ({ code: c.code, name: c.name, category: c.category, unit: c.unit, shelfLifeDays: c.shelfLifeDays, gramsPerUnit: c.gramsPerUnit, ...c.nutritionPer100, nutritionSource: c.nutritionSource, active: c.active ? 'yes' : 'no' }));
  if (entity === 'vehicles') rows = s.vehicles.map((v) => ({ registrationNo: v.registrationNo, transporterName: v.transporterName, capacityKg: v.capacityKg, driverName: v.driver.name, driverPhone: v.driver.phone, gpsDeviceId: v.gpsDeviceId }));
  audit(s, actor(ctx), `${entity}.exported`, { kind: 'EXPORT', id: newId(s), label: `${EXCHANGE[entity].label}: ${rows.length} rows` });
  const cols = [...EXCHANGE[entity].columns, ...(rows[0] ? Object.keys(rows[0]).filter((k) => !EXCHANGE[entity].columns.includes(k)) : [])];
  return csvResponse(`${entity}_${s.tenant.id}_${today()}_DEMO.csv`, toCsv(rows, cols));
}, 'data:export');

route('PUT', '/registry/tenants/current/access', (ctx) => {
  const r = tenantConfigSchema.shape.access.unwrap().safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  ctx.s.tenant.config = { ...ctx.s.tenant.config, access: r.data };
  audit(ctx.s, actor(ctx), 'access.updated', { kind: 'ROLES', id: ctx.s.tenant.id, label: 'Roles & access' });
  return ctx.s.tenant;
}, 'config:manage');

route('GET', '/registry/health', (ctx) => {
  const s = ctx.s;
  const fac = s.facilities.filter((f) => inScope(ctx, f.geoPath));
  const soon = new Date(Date.now() + 60 * 86_400_000).toLocaleDateString('en-CA');
  const count = <T,>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((a, x) => ({ ...a, [key(x)]: (a[key(x)] ?? 0) + 1 }), {});
  return {
    facilities: count(fac.filter((f) => f.active), (f) => f.type), facilitiesWithoutCoordinates: fac.filter((f) => f.active && !f.location).length,
    schoolsWithoutKitchenLink: fac.filter((f) => f.type === 'SCHOOL' && f.active && f.school && !f.school.hasKitchen && !f.school.servedByKitchenId).length, inactiveFacilities: fac.filter((f) => !f.active).length,
    suppliers: count(s.suppliers, (x) => x.status), suppliersLicenceExpiring: s.suppliers.filter((x) => x.status === 'APPROVED' && x.fssaiValidUntil <= soon).length,
    products: s.commodities.filter((c) => c.active).length, locations: count(s.geo, (g) => g.levelName),
  };
}, 'admin:access');

route('GET', '/identity/users/stats', (ctx) => {
  const us = ctx.s.users.filter((u) => inScope(ctx, u.geoPath));
  const byRole = us.reduce<Record<string, number>>((a, u) => ({ ...a, [u.role]: (a[u.role] ?? 0) + 1 }), {});
  return { byRole, total: us.length, neverSignedIn: us.filter((u) => !u.lastLoginAt).length, suspended: us.filter((u) => u.status === 'SUSPENDED').length, mustChangePassword: 0, schoolsWithHead: new Set(us.filter((u) => u.role === 'SCHOOL_HEAD' && u.status === 'ACTIVE').map((u) => u.facilityId)).size };
}, 'admin:access');

route('POST', '/identity/users/import', (ctx) => {
  const s = ctx.s;
  const rows = (ctx.body?.rows ?? []) as Record<string, unknown>[];
  const dryRun = ctx.body?.dryRun !== false;
  const errors: ImportResult['errors'] = [];
  const plans: { username: string; set: Record<string, unknown>; exists: boolean }[] = [];
  const seen = new Set<string>();
  rows.forEach((raw, i) => {
    const row = i + 2;
    const p = userImportRowSchema.safeParse(raw);
    if (!p.success) return void errors.push({ row, code: String(raw.username ?? ''), message: issues(p.error) });
    const d = p.data;
    if (seen.has(d.username)) return void errors.push({ row, code: d.username, message: 'Duplicate in file' });
    seen.add(d.username);
    const unit = s.geo.find((u) => match(u, d.location) || u.geoPath.toLowerCase() === d.location.toLowerCase());
    if (!unit) return void errors.push({ row, code: d.username, message: `Unknown location "${d.location}"` });
    if (!inScope(ctx, unit.geoPath) && !isWithinScope({ geoPath: ctx.user.geoPath }, unit.geoPath)) return void errors.push({ row, code: d.username, message: 'Outside your area' });
    const facility = d.facilityCode ? s.facilities.find((f) => f.code === d.facilityCode) : undefined;
    if (d.facilityCode && !facility) return void errors.push({ row, code: d.username, message: `Unknown facility code ${d.facilityCode}` });
    if (FACILITY_BOUND_ROLES.includes(d.role as Role) && !facility) return void errors.push({ row, code: d.username, message: `${ROLE_LABELS[d.role as Role]} needs facilityCode` });
    const geoPath = facility?.geoPath ?? unit.geoPath;
    const label = [...geoPath.split('/').map((_, k, a) => s.geo.find((u) => u.geoPath === a.slice(0, k + 1).join('/'))?.name), facility?.name].filter(Boolean).join(' › ');
    plans.push({ username: d.username, exists: s.users.some((u) => u.username === d.username), set: { name: d.name, role: d.role, geoPath, facilityId: facility?.id, facilityName: facility?.name, scopeLabel: label, phone: d.phone, email: d.email } });
  });
  const result: ImportResult = { entity: 'users', dryRun: dryRun || errors.length > 0, total: rows.length, created: plans.filter((p) => !p.exists).length, updated: plans.filter((p) => p.exists).length, errors };
  if (result.dryRun) return result;
  const credentials: { username: string; temporaryPassword: string }[] = [];
  for (const p of plans) {
    const existing = s.users.find((u) => u.username === p.username);
    if (existing) Object.assign(existing, p.set);
    else {
      s.users.unshift({ ...(p.set as Record<string, unknown>), id: newId(s), username: p.username, status: 'ACTIVE', tenantId: s.tenant.id, mfaEnabled: false, createdAt: new Date().toISOString() } as never);
      credentials.push({ username: p.username, temporaryPassword: `Nt-${Math.random().toString(36).slice(2, 10)}9a` });
    }
  }
  audit(s, actor(ctx), 'users.imported', { kind: 'IMPORT', id: newId(s), label: `Users: ${plans.length} rows` }, [{ field: 'created', to: result.created }, { field: 'updated', to: result.updated }]);
  return { ...result, credentials };
}, 'user:manage');

route('GET', '/identity/export/users', (ctx) => {
  const us = ctx.s.users.filter((u) => inScope(ctx, u.geoPath));
  audit(ctx.s, actor(ctx), 'users.exported', { kind: 'EXPORT', id: newId(ctx.s), label: `Users: ${us.length} rows` });
  return csvResponse(`users_${ctx.s.tenant.id}_${today()}_DEMO.csv`, toCsv(us.map((u) => ({ username: u.username, name: u.name, role: u.role, location: u.geoPath.split('/').pop(), facilityCode: u.facilityId ? ctx.s.facilityById.get(u.facilityId)?.code : '', phone: u.phone ?? '', email: u.email ?? '', area: u.scopeLabel, status: u.status, lastLoginAt: u.lastLoginAt ?? '' }))));
}, 'data:export');
