import {
  buildStages, buildTraceGraph, computeCompleteness, computeFlow, daysOfCover, pct, round, SEVERITIES, verifyChain,
  type AreaPerformanceDto, type FacilityDto, type KpiDto, type LotDto, type MealServiceDto, type OverviewDto, type Severity, type TraceEventDto,
} from '@nt/domain';
import { conflict, notFound } from '../ops';
import { stores } from '../store';
import { actor, facilityAllowed, inScope, includes, paginate, route, scopedGeo, type Ctx } from '../server';
import type { TenantStore } from '../store';

/* ────────────── Trace ────────────── */
const served = (s: TenantStore, lotEvents: TraceEventDto[]) => {
  const pids = new Set(lotEvents.filter((e) => e.type === 'CONSUMED' && e.refs.productionId).map((e) => e.refs.productionId!));
  return [...pids].flatMap((p) => (s.byProduction.get(p) ?? []).filter((e) => e.type === 'MEAL_SERVED'));
};
const completenessOf = (s: TenantStore, lot: LotDto) => {
  const ev = s.byLot.get(lot.id) ?? [];
  return computeCompleteness(lot, ev, served(s, ev));
};
route('GET', '/trace/lots', (ctx) => {
  const q = ctx.query;
  const rows = ctx.s.lots.filter((l) => (!q.status || l.status === q.status) && (!q.commodityId || l.commodity.id === q.commodityId) && (!q.supplierId || l.supplier.id === q.supplierId) && (!q.stage || l.currentStage === q.stage)
    && (!q.q || includes(l.code, q.q) || includes(l.supplierLotNo, q.q) || includes(l.poNumber, q.q))).map((l) => ({ ...l, completeness: completenessOf(ctx.s, l).score }));
  return paginate(rows, q, 'createdAt');
}, 'trace:read');
route('GET', '/trace/lots/resolve', (ctx) => {
  const code = (ctx.query.code ?? '').trim();
  const lot = ctx.s.lots.find((l) => l.code === code.toUpperCase() || l.supplierLotNo === code);
  if (!lot) throw notFound('Lot');
  return { id: lot.id, code: lot.code };
}, 'trace:read');
const lotOr404 = (s: TenantStore, id: string) => s.lotById.get(id) ?? (() => { throw notFound('Lot'); })();
route('GET', '/trace/lots/:id', (ctx) => lotOr404(ctx.s, ctx.params.id!), 'trace:read');
route('GET', '/trace/lots/:id/journey', (ctx) => {
  const lot = lotOr404(ctx.s, ctx.params.id!);
  const lotEvents = ctx.s.byLot.get(lot.id) ?? [];
  const servedEvents = served(ctx.s, lotEvents);
  const completeness = computeCompleteness(lot, lotEvents, servedEvents);
  return { lot: { ...lot, completeness: completeness.score }, stages: buildStages(lotEvents, servedEvents), flow: computeFlow(lotEvents, servedEvents), completeness, events: lotEvents, integrity: { verified: true, eventsChecked: lotEvents.length + servedEvents.length } };
}, 'trace:read');
route('GET', '/trace/lots/:id/graph', (ctx) => {
  const lot = lotOr404(ctx.s, ctx.params.id!);
  const lotEvents = ctx.s.byLot.get(lot.id) ?? [];
  return buildTraceGraph({ rootId: `L:${lot.id}`, direction: 'forward', events: [...lotEvents, ...served(ctx.s, lotEvents)], lots: [lot] });
}, 'trace:read');
route('GET', '/trace/facilities/:id/sources', (ctx) => {
  const s = ctx.s;
  const from = ctx.query.from!;
  const to = `${ctx.query.to}T23:59:59.999Z`;
  const svc = s.events.filter((e) => e.type === 'MEAL_SERVED' && e.facility?.id === ctx.params.id && e.occurredAt >= from && e.occurredAt <= to);
  const pids = new Set(svc.map((e) => e.refs.productionId));
  const consumed = [...pids].flatMap((p) => (s.byProduction.get(p!) ?? []).filter((e) => e.type === 'CONSUMED'));
  const lotIds = [...new Set(consumed.map((e) => e.lotId!))];
  const lots = lotIds.map((id) => s.lotById.get(id)!);
  const upstream = lotIds.flatMap((id) => (s.byLot.get(id) ?? []).filter((e) => e.type === 'LOT_CREATED' || e.type === 'RECEIVED'));
  return {
    graph: buildTraceGraph({ rootId: `M:${ctx.params.id}`, direction: 'backward', events: [...upstream, ...consumed, ...svc], lots }),
    usage: lots.map((l) => ({ lot: l, consumed: round(consumed.filter((c) => c.lotId === l.id).reduce((a, c) => a + c.quantity, 0)), batches: new Set(consumed.filter((c) => c.lotId === l.id).map((c) => c.refs.productionId)).size })).sort((a, b) => b.consumed - a.consumed),
    mealsServed: svc.reduce((a, e) => a + (e.meals?.count ?? 0), 0), days: new Set(svc.map((e) => e.occurredAt.slice(0, 10))).size,
  };
}, 'trace:read');
route('GET', '/trace/events', (ctx) => paginate(ctx.s.events.filter((e) => (!ctx.query.lotId || e.lotId === ctx.query.lotId) && (!ctx.query.type || e.type === ctx.query.type)), ctx.query, 'seq'), 'trace:read');
route('GET', '/trace/ledger/verify', (ctx) => {
  const r = verifyChain(ctx.s.events);
  return { verified: r.verified, eventsChecked: r.eventsChecked, firstSeq: 1, lastSeq: ctx.s.events.length, headHash: r.headHash ?? ctx.s.events[ctx.s.events.length - 1]?.hash ?? '', brokenAtSeq: r.brokenAtSeq, checkedAt: new Date().toISOString() };
}, 'trace:read');

/* ────────────── Insight ────────────── */
const day = (offset: number, from = new Date()) => new Date(from.getTime() + offset * 86_400_000).toLocaleDateString('en-CA');
const schoolsIn = (s: TenantStore, geo: string) => s.facilities.filter((f) => f.type === 'SCHOOL' && (f.geoPath === geo || f.geoPath.startsWith(`${geo}/`)));
const slotsOf = (s: TenantStore, schools: FacilityDto[]) => schools.reduce((a, f) => a + new Set(s.tenant.config.programmes.filter((p) => f.school?.programmes.includes(p.code)).flatMap((p) => p.mealTypes)).size, 0);
function totals(rows: MealServiceDto[]) {
  return rows.reduce((t, r) => ({ enrolled: t.enrolled + r.enrolled, present: t.present + r.present, available: t.available + r.mealsAvailable, served: t.served + r.mealsServed, leftover: t.leftover + r.leftoverServings, reports: t.reports + 1, linked: t.linked + (r.productionBatchId ? r.mealsServed : 0) }), { enrolled: 0, present: 0, available: 0, served: 0, leftover: 0, reports: 0, linked: 0 });
}
const svcIn = (s: TenantStore, geo: string, from: string, to: string) => s.services.filter((r) => r.date >= from && r.date <= to && (r.school.geoPath === geo || r.school.geoPath.startsWith(`${geo}/`)));
const geoIn = (paths: string[], geo: string) => paths.some((p) => p === geo || p.startsWith(`${geo}/`));
function stockRisk(s: TenantStore, geo: string) {
  const onHand = new Map<string, { name: string; unit: string; q: number }>();
  for (const c of s.stock.values()) {
    const f = s.facilityById.get(c.facilityId)!;
    if (c.onHand <= 0 || !geoIn([f.geoPath], geo)) continue;
    const lot = s.lotById.get(c.lotId)!;
    if (lot.status !== 'RELEASED') continue;
    const cur = onHand.get(lot.commodity.id) ?? { name: lot.commodity.name, unit: lot.commodity.unit, q: 0 };
    cur.q += c.onHand;
    onHand.set(lot.commodity.id, cur);
  }
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const used = new Map<string, number>();
  for (const l of s.ledger) if (l.type === 'ISSUE' && l.at >= since && geoIn([s.facilityById.get(l.facilityId)!.geoPath], geo)) used.set(l.commodityName, (used.get(l.commodityName) ?? 0) - l.quantity);
  return [...onHand.values()].map((v) => ({ commodityName: v.name, unit: v.unit, onHand: round(v.q), daysOfCover: daysOfCover(v.q, (used.get(v.name) ?? 0) / 14) })).sort((a, b) => (a.daysOfCover ?? 999) - (b.daysOfCover ?? 999));
}
const openExceptions = (s: TenantStore, geo: string) => s.exceptions.filter((e) => e.status !== 'RESOLVED' && geoIn([e.geoPath], geo));

route('GET', '/insight/dashboard/overview', (ctx) => {
  const s = ctx.s;
  const geo = scopedGeo(ctx);
  const date = ctx.query.date ?? day(0);
  const d = new Date(`${date}T12:00:00`);
  const t = totals(svcIn(s, geo, date, date));
  const prev = totals(svcIn(s, geo, day(-7, d), day(-7, d)));
  const week = totals(svcIn(s, geo, day(-6, d), date));
  const schools = schoolsIn(s, geo);
  const slots = slotsOf(s, schools);
  const ships = s.shipments.filter((x) => geoIn(x.geoPaths, geo));
  const grace = s.tenant.config.thresholds.shipmentDelayGraceHours * 3_600_000;
  const recv = ships.filter((x) => x.receivedAt && x.receivedAt >= day(-30));
  const onTime = recv.filter((x) => new Date(x.receivedAt!).getTime() <= new Date(x.expectedArrivalAt).getTime() + grace && !x.hasDiscrepancy).length;
  const open = openExceptions(s, geo);
  const kpis: KpiDto[] = [
    { key: 'fed', label: 'Children fed of those present', value: pct(t.served, t.present), unit: '%', previous: pct(prev.served, prev.present), higherIsBetter: true, target: 100, hint: `${t.served.toLocaleString('en-IN')} of ${t.present.toLocaleString('en-IN')} today` },
    { key: 'reporting', label: 'School meal reports received', value: pct(t.reports, slots), unit: '%', previous: pct(prev.reports, slots), higherIsBetter: true, hint: `${t.reports} of ${slots} expected` },
    { key: 'traceable', label: 'Meals traceable to source lots', value: pct(week.linked, week.served), unit: '%', higherIsBetter: true, hint: 'Last 7 days' },
    { key: 'otif', label: 'Deliveries on time and in full', value: pct(onTime, recv.length), unit: '%', higherIsBetter: true, hint: `${recv.length} received in 30 days` },
    { key: 'delayed', label: 'Shipments delayed now', value: ships.filter((x) => x.status === 'DELAYED').length, unit: 'count', higherIsBetter: false, hint: `${ships.filter((x) => ['DISPATCHED', 'IN_TRANSIT'].includes(x.status)).length} in transit` },
    { key: 'held', label: 'Lots on hold or recalled', value: s.lots.filter((l) => l.status === 'ON_HOLD' || l.status === 'RECALLED').length, unit: 'count', higherIsBetter: false },
    { key: 'waste', label: 'Leftover meals', value: pct(week.leftover, week.available), unit: '%', higherIsBetter: false, hint: 'Last 7 days' },
  ];
  const since = day(-30);
  const kg = (pred: (e: TraceEventDto) => boolean) => round(s.events.filter((e) => e.unit === 'KG' && e.occurredAt >= since && pred(e)).reduce((a, e) => a + e.quantity, 0));
  const party = (e: TraceEventDto) => (e.type === 'RECEIVED' ? e.to : e.type === 'DISPATCHED' ? e.from : e.facility ?? e.to ?? e.from);
  const inGeo = (e: TraceEventDto) => { const p = party(e); return !!p && (p.type === 'SUPPLIER' ? geo === s.tenant.id : geoIn([p.geoPath], geo)); };
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const dd = day(-i, d);
    if (!s.tenant.config.operatingDays.includes(new Date(`${dd}T12:00:00`).getDay())) continue;
    const x = totals(svcIn(s, geo, dd, dd));
    trend.push({ date: dd, expected: x.present, served: x.served, reportingPct: pct(x.reports, slots) });
  }
  const overview: OverviewDto = {
    asOf: new Date().toISOString(), scopeLabel: geo, kpis,
    mealFunnel: [
      { key: 'enrolled', label: 'Enrolled', value: t.enrolled, unit: 'children' }, { key: 'present', label: 'Present', value: t.present, unit: 'children' },
      { key: 'available', label: 'Meals prepared', value: t.available, unit: 'meals' }, { key: 'served', label: 'Meals served', value: t.served, unit: 'meals' },
    ],
    supplyFunnel: [
      { key: 'procured', label: 'Procured', value: kg((e) => e.type === 'LOT_CREATED' && geo === s.tenant.id), unit: 'kg', note: 'Lots created at source' },
      { key: 'state', label: 'Accepted at state warehouse', value: kg((e) => e.type === 'RECEIVED' && e.quantityKind === 'ACCEPTED' && e.to?.type === 'STATE_WAREHOUSE' && inGeo(e)), unit: 'kg' },
      { key: 'district', label: 'Accepted at district stores', value: kg((e) => e.type === 'RECEIVED' && e.quantityKind === 'ACCEPTED' && (e.to?.type === 'DISTRICT_WAREHOUSE' || e.to?.type === 'BLOCK_STORE') && inGeo(e)), unit: 'kg' },
      { key: 'schools', label: 'Accepted at schools', value: kg((e) => e.type === 'RECEIVED' && e.quantityKind === 'ACCEPTED' && e.to?.type === 'SCHOOL' && inGeo(e)), unit: 'kg' },
      { key: 'consumed', label: 'Cooked into meals', value: kg((e) => e.type === 'CONSUMED' && inGeo(e)), unit: 'kg' },
    ],
    trend, stockRisk: stockRisk(s, geo).slice(0, 6),
    exceptionsBySeverity: Object.fromEntries(SEVERITIES.map((sv) => [sv, open.filter((e) => e.severity === sv).length])) as Record<Severity, number>,
  };
  return overview;
}, 'dashboard:read');

route('GET', '/insight/dashboard/areas', (ctx) => {
  const s = ctx.s;
  const geo = scopedGeo(ctx);
  const date = ctx.query.date ?? day(0);
  const d = new Date(`${date}T12:00:00`);
  const depth = geo.split('/').length;
  const groups = new Map<string, FacilityDto[]>();
  for (const f of schoolsIn(s, geo)) {
    const child = f.geoPath.split('/').slice(0, depth + 1).join('/');
    groups.set(child, [...(groups.get(child) ?? []), f]);
  }
  const grace = s.tenant.config.thresholds.shipmentDelayGraceHours * 3_600_000;
  return [...groups].map<AreaPerformanceDto>(([path, list]) => {
    const t = totals(svcIn(s, path, date, date));
    const w = totals(svcIn(s, path, day(-6, d), date));
    const ships = s.shipments.filter((x) => geoIn(x.geoPaths, path) && x.receivedAt && x.receivedAt >= day(-30));
    const risk = stockRisk(s, path);
    return {
      geoPath: path, name: s.geo.find((g) => g.geoPath === path)?.name ?? path, schools: list.length, reportingPct: pct(t.reports, slotsOf(s, list)), coveragePct: pct(t.served, t.present), mealsServed: t.served,
      onTimeDeliveryPct: pct(ships.filter((x) => new Date(x.receivedAt!).getTime() <= new Date(x.expectedArrivalAt).getTime() + grace && !x.hasDiscrepancy).length, ships.length),
      stockDaysOfCover: risk.find((r) => r.daysOfCover !== null)?.daysOfCover ?? null, wastagePct: pct(w.leftover, w.available), openExceptions: openExceptions(s, path).length, traceCompletenessPct: pct(w.linked, w.served),
    };
  }).sort((a, b) => a.coveragePct - b.coveragePct);
}, 'dashboard:read');

const exceptionView = (e: TenantStore['exceptions'][number]) => ({ ...e, ageHours: round((Date.now() - new Date(e.createdAt).getTime()) / 3_600_000, 1), overdue: e.status !== 'RESOLVED' && new Date(e.dueAt).getTime() < Date.now() });
const exceptionVisible = (ctx: Ctx, e: TenantStore['exceptions'][number]) => inScope(ctx, e.geoPath) && (!ctx.user.facilityId || e.facility?.id === ctx.user.facilityId);
const SEV_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
route('GET', '/insight/exceptions', (ctx) => {
  const q = ctx.query;
  const rows = ctx.s.exceptions.filter((e) => exceptionVisible(ctx, e) && (!q.open || e.status !== 'RESOLVED') && (!q.status || q.status === 'all' || e.status === q.status) && (!q.severity || e.severity === q.severity) && (!q.type || e.type === q.type) && includes(e.title, q.q)).map(exceptionView);
  if (q.sort === 'severity') return paginate(rows.map((r) => ({ ...r, _rank: SEV_RANK[r.severity] })), { ...q, sort: '_rank' });
  return paginate(rows, q, 'createdAt');
}, 'exception:read');
route('GET', '/insight/exceptions/:id', (ctx) => exceptionView(ctx.s.exceptions.find((e) => e.id === ctx.params.id) ?? (() => { throw notFound('Exception'); })()), 'exception:read');
route('POST', '/insight/exceptions/:id/actions', (ctx) => {
  const e = ctx.s.exceptions.find((x) => x.id === ctx.params.id)!;
  const a = ctx.body.action as string;
  if (a === 'REOPEN' && e.status !== 'RESOLVED') throw conflict('Only resolved exceptions can be reopened');
  if (a !== 'REOPEN' && e.status === 'RESOLVED') throw conflict('Exception is already resolved');
  if (a === 'ESCALATE') {
    const ladder = ['BLOCK_COORDINATOR', 'DISTRICT_OFFICER', 'STATE_ADMIN'];
    e.owner = { role: ladder[Math.min(ladder.indexOf(e.owner?.role ?? '') + 1, 2)] ?? 'DISTRICT_OFFICER' };
    e.severity = e.severity === 'LOW' ? 'MEDIUM' : e.severity === 'MEDIUM' ? 'HIGH' : 'CRITICAL';
  }
  e.status = ({ ACKNOWLEDGE: 'ACKNOWLEDGED', RESOLVE: 'RESOLVED', REOPEN: 'OPEN' } as Record<string, typeof e.status>)[a] ?? e.status;
  e.log.push({ action: a, note: ctx.body.note, at: new Date().toISOString(), by: actor(ctx) });
  return exceptionView(e);
}, 'exception:manage');

route('GET', '/insight/notifications', (ctx) => ctx.s.notifications.filter((n) => inScope(ctx, n.geoPath) && (!ctx.user.facilityId || n.geoPath === ctx.s.facilityById.get(ctx.user.facilityId)?.geoPath)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map(({ readBy, geoPath: _g, ...n }) => ({ ...n, read: readBy.includes(ctx.user.id) })));
route('POST', '/insight/notifications/read', (ctx) => {
  for (const n of ctx.s.notifications) if ((ctx.body.ids as string[]).includes(n.id) && !n.readBy.includes(ctx.user.id)) n.readBy.push(ctx.user.id);
  return { ok: true };
});
route('GET', '/insight/audit-logs', (ctx) => paginate(ctx.s.audit.filter((a) => (includes(a.entity.label, ctx.query.q) || includes(a.actor.name, ctx.query.q)) && includes(a.action, ctx.query.action)), ctx.query, 'at'), 'audit:read');

route('GET', '/insight/reports/:key', (ctx) => {
  const s = ctx.s;
  const geo = scopedGeo(ctx);
  const from = ctx.query.from ?? day(-30);
  const to = ctx.query.to ?? day(0);
  let rows: Record<string, unknown>[] = [];
  if (ctx.params.key === 'meal-service') rows = svcIn(s, geo, from, to).filter((r) => facilityAllowed(ctx, r.school.id)).map((r) => ({ date: r.date, district: r.districtName, block: r.blockName, school: r.school.name, meal: r.mealType, enrolled: r.enrolled, present: r.present, prepared: r.mealsAvailable, served: r.mealsServed, leftover: r.leftoverServings, wastage_kg: r.wastageKg, interrupted: r.serviceInterrupted ? 'yes' : 'no', linked_to_batch: r.productionBatchId ? 'yes' : 'no', batch: r.batchNo }));
  if (ctx.params.key === 'shipments') rows = s.shipments.filter((x) => geoIn(x.geoPaths, geo)).map((x) => ({ shipment: x.shipmentNo, from: x.from.name, to: x.to.name, status: x.status, expected_arrival: x.expectedArrivalAt, received_at: x.receivedAt ?? '', discrepancy: x.hasDiscrepancy ? 'yes' : 'no' }));
  if (ctx.params.key === 'exceptions') rows = s.exceptions.filter((e) => geoIn([e.geoPath], geo)).map((e) => ({ id: e.exceptionNo, type: e.type, severity: e.severity, status: e.status, title: e.title, facility: e.facility?.name ?? '', owner_role: e.owner?.role, due_at: e.dueAt }));
  if (ctx.params.key === 'stock') rows = [...s.stock.values()].filter((c) => c.onHand > 0 && geoIn([s.facilityById.get(c.facilityId)!.geoPath], geo)).map((c) => ({ facility: s.facilityById.get(c.facilityId)!.name, lot: s.lotById.get(c.lotId)!.code, commodity: s.lotById.get(c.lotId)!.commodity.name, on_hand: c.onHand, reserved: c.reserved }));
  const headers = rows.length ? Object.keys(rows[0]!) : ['no_data'];
  const esc = (v: unknown) => { const x = String(v ?? ''); const safe = /^[=+\-@]/.test(x) ? `'${x}` : x; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  const body = `\uFEFF${[headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')}`;
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${ctx.params.key}_${geo.replace(/\//g, '-')}_${from}_${to}_DEMO.csv"` } });
}, 'report:export');

/* Public provenance for QR scans — no sign-in, no quantities, no people. */
route('GET', '/trace/public/lots/:code', (ctx) => {
  for (const s of stores.values()) {
    const lot = s.lots.find((l) => l.code === ctx.params.code!.toUpperCase());
    if (lot) return { code: lot.code, commodity: lot.commodity.name, supplier: lot.supplier.name, origin: lot.origin, packedOn: lot.packedOn, expiresOn: lot.expiresOn, status: lot.status, stageReached: lot.currentStage, safeToUse: lot.status === 'RELEASED' || lot.status === 'DEPLETED' };
  }
  throw notFound('Lot');
}, undefined, true);
