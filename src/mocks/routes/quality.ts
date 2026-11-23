import { inspectionCreateSchema, round, type RecallAffectedDto, type RecallDto } from '@nt/domain';
import { audit, autoResolve, cell, conflict, facility, facRef, invalid, newId, nextNo, notFound, raise, trace } from '../ops';
import { actor, facilityAllowed, inScope, paginate, route, type Ctx } from '../server';
import type { TenantStore } from '../store';

const nowIso = () => new Date().toISOString();

route('GET', '/quality/inspections', (ctx) => paginate(ctx.s.inspections.filter((i) => inScope(ctx, i.facility.geoPath) && (!ctx.query.result || i.result === ctx.query.result) && (!ctx.query.lotId || i.lot?.id === ctx.query.lotId) && (!ctx.query.undecided || !i.decision)), ctx.query, 'createdAt'), 'quality:read');
route('GET', '/quality/inspections/:id', (ctx) => ctx.s.inspections.find((i) => i.id === ctx.params.id) ?? (() => { throw notFound('Inspection'); })(), 'quality:read');
route('POST', '/quality/inspections', (ctx) => {
  const r = inspectionCreateSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const b = r.data;
  const s = ctx.s;
  const f = facility(s, b.facilityId);
  const lot = b.lotId ? s.lotById.get(b.lotId) : undefined;
  if (b.result === 'PASS' && b.parameters.some((p) => !p.passed)) throw invalid('A failed parameter cannot produce a pass result');
  const a = actor(ctx);
  const ins = { ...b, id: newId(s), inspectionNo: nextNo(s, 'INS', new Date()), facility: facRef(f), lot: lot ? { id: lot.id, code: lot.code, commodityId: lot.commodity.id, commodityName: lot.commodity.name, unit: lot.commodity.unit, expiresOn: lot.expiresOn, status: lot.status } : undefined, inspector: a, createdAt: nowIso() };
  s.inspections.unshift(ins);
  if (lot) {
    trace(s, { type: 'INSPECTED', occurredAt: b.sampledAt, lotId: lot.id, lotCode: lot.code, quantity: 0, quantityKind: 'NONE', facility: facRef(f), refs: { inspectionId: ins.id }, actor: a, note: `${b.type}: ${b.result}` });
    if (b.result === 'FAIL') {
      if (lot.status !== 'ON_HOLD' && lot.status !== 'RECALLED') {
        lot.status = 'ON_HOLD';
        trace(s, { type: 'STATUS_CHANGED', occurredAt: nowIso(), lotId: lot.id, lotCode: lot.code, quantity: 0, quantityKind: 'NONE', facility: facRef(f), refs: { inspectionId: ins.id }, actor: a, note: `ON_HOLD: automatic hold — ${ins.inspectionNo} failed` });
      }
      raise(s, `QC:${ins.id}`, { type: 'QUALITY_FAILURE', severity: 'HIGH', title: `${lot.code} failed ${b.type.toLowerCase().replace('_', ' ')} inspection`, detail: b.parameters.filter((x) => !x.passed).map((x) => `${x.name}: ${x.value}${x.unit ?? ''} (limit ${x.limit ?? '—'})`).join('; '), slaHours: 48 }, { geoPath: f.geoPath, facility: facRef(f), entity: { kind: 'LOT', id: lot.id, label: lot.code }, link: `/trace/lots/${lot.id}` }, new Date());
    }
  }
  return ins;
}, 'quality:inspect');
route('POST', '/quality/inspections/:id/decision', (ctx) => {
  const s = ctx.s;
  const ins = s.inspections.find((i) => i.id === ctx.params.id);
  if (!ins?.lot) throw notFound('Inspection');
  if (ins.decision) throw conflict('A decision is already recorded');
  if (ctx.body.decision === 'RELEASE' && ins.result === 'FAIL') throw conflict('A failed lot cannot be released on the same inspection. Record a re-test.');
  const status = ({ RELEASE: 'RELEASED', HOLD: 'ON_HOLD', REJECT: 'REJECTED' } as const)[ctx.body.decision as 'RELEASE'];
  ins.decision = { decision: ctx.body.decision, reason: ctx.body.reason, by: actor(ctx), at: nowIso() };
  const lot = s.lotById.get(ins.lot.id)!;
  lot.status = status;
  trace(s, { type: 'STATUS_CHANGED', occurredAt: nowIso(), lotId: lot.id, lotCode: lot.code, quantity: 0, quantityKind: 'NONE', facility: ins.facility, refs: { inspectionId: ins.id }, actor: actor(ctx), note: `${status}: ${ctx.body.reason}` });
  autoResolve(s, `QC:${ins.id}`, `Decision: ${ctx.body.decision.toLowerCase()}`);
  audit(s, actor(ctx), `quality.lot_${String(ctx.body.decision).toLowerCase()}`, { kind: 'LOT', id: lot.id, label: lot.code });
  return ins;
}, 'quality:decide');

route('GET', '/quality/capa', (ctx) => {
  const today = new Date().toLocaleDateString('en-CA');
  return paginate(ctx.s.capas.filter((c) => inScope(ctx, c.facility.geoPath) && (!ctx.query.status || c.status === ctx.query.status)).map((c) => ({ ...c, overdue: c.status !== 'CLOSED' && c.dueDate < today })), ctx.query, 'dueDate');
}, 'quality:read');
route('POST', '/quality/capa', (ctx) => {
  const f = facility(ctx.s, ctx.body.facilityId);
  const c = { ...ctx.body, id: newId(ctx.s), capaNo: nextNo(ctx.s, 'CAPA', new Date()), facility: facRef(f), status: 'OPEN', log: [{ status: 'OPEN', note: 'Raised', at: nowIso(), by: actor(ctx) }], createdAt: nowIso() };
  ctx.s.capas.unshift(c);
  return c;
}, 'quality:inspect');
route('PATCH', '/quality/capa/:id', (ctx) => {
  const c = ctx.s.capas.find((x) => x.id === ctx.params.id)!;
  c.status = ctx.body.status;
  c.log.push({ status: c.status, note: ctx.body.note, at: nowIso(), by: actor(ctx) });
  return c;
}, 'quality:inspect');

/* ── Recalls: impact computed live from the custody ledger ── */
export function recallImpact(s: TenantStore, lotId: string): RecallAffectedDto[] {
  const events = s.byLot.get(lotId) ?? [];
  const rows = new Map<string, RecallAffectedDto>();
  const prodFacility = new Map<string, string>();
  for (const e of events) {
    if (e.type === 'RECEIVED' && e.quantityKind === 'ACCEPTED' && e.to) {
      const f = s.facilityById.get(e.to.id)!;
      const r = rows.get(f.id) ?? { facility: facRef(f), districtName: f.districtName, receivedQty: 0, consumedQty: 0, onHandQty: 0, mealsServedWithLot: 0, acknowledged: false };
      r.receivedQty = round(r.receivedQty + e.quantity);
      rows.set(f.id, r);
    }
    if (e.type === 'CONSUMED' && e.facility) {
      const r = rows.get(e.facility.id);
      if (r) r.consumedQty = round(r.consumedQty + e.quantity);
      if (e.refs.productionId) prodFacility.set(e.refs.productionId, e.facility.id);
    }
  }
  for (const [pid, fid] of prodFacility) {
    const served = (s.byProduction.get(pid) ?? []).filter((e) => e.type === 'MEAL_SERVED').reduce((a, e) => a + (e.meals?.count ?? 0), 0);
    rows.get(fid)!.mealsServedWithLot += served;
  }
  for (const r of rows.values()) r.onHandQty = round(cell(s, r.facility.id, lotId)?.onHand ?? 0);
  return [...rows.values()];
}
const withStats = (r: Omit<RecallDto, 'stats'>): RecallDto => ({
  ...r,
  stats: {
    facilities: r.affected.length, acknowledged: r.affected.filter((a) => a.acknowledged).length, onHandQty: round(r.affected.reduce((a, x) => a + x.onHandQty, 0)),
    consumedQty: round(r.affected.reduce((a, x) => a + x.consumedQty, 0)), mealsServed: r.affected.reduce((a, x) => a + x.mealsServedWithLot, 0), schools: r.affected.filter((a) => a.facility.type === 'SCHOOL').length,
  },
});
route('GET', '/quality/recalls', (ctx) => paginate(ctx.s.recalls.map(withStats), ctx.query, 'initiatedAt'), 'quality:read');
route('GET', '/quality/recalls/:id', (ctx: Ctx) => {
  const r = ctx.s.recalls.find((x) => x.id === ctx.params.id);
  if (!r) throw notFound('Recall');
  return withStats(r);
}, 'quality:read');
route('POST', '/quality/recalls', (ctx) => {
  const s = ctx.s;
  const lots = (ctx.body.lotIds as string[]).map((id) => s.lotById.get(id)!);
  if (lots.some((l) => l.status === 'RECALLED')) throw conflict('A selected lot is already under recall');
  const a = actor(ctx);
  const id = newId(s);
  const merged = new Map<string, RecallAffectedDto>();
  for (const l of lots) for (const row of recallImpact(s, l.id)) merged.set(row.facility.id, row);
  const r = { id, recallNo: nextNo(s, 'RCL', new Date()), lots: lots.map((l) => ({ id: l.id, code: l.code, commodityId: l.commodity.id, commodityName: l.commodity.name, unit: l.commodity.unit, expiresOn: l.expiresOn, status: 'RECALLED' as const })), reason: ctx.body.reason, instruction: ctx.body.instruction, severity: ctx.body.severity, status: 'INITIATED' as const, initiatedBy: a, initiatedAt: nowIso(), affected: [...merged.values()] };
  s.recalls.unshift(r);
  for (const l of lots) {
    l.status = 'RECALLED';
    trace(s, { type: 'STATUS_CHANGED', occurredAt: r.initiatedAt, lotId: l.id, lotCode: l.code, quantity: 0, quantityKind: 'NONE', refs: { recallId: id }, actor: a, note: `RECALLED: ${r.reason}` });
    trace(s, { type: 'RECALL_INITIATED', occurredAt: r.initiatedAt, lotId: l.id, lotCode: l.code, quantity: 0, quantityKind: 'NONE', refs: { recallId: id }, actor: a, note: r.reason });
  }
  for (const row of r.affected) if (row.onHandQty > 0 || row.facility.type === 'SCHOOL') raise(s, `RECALL:${id}:${row.facility.id}`, { type: 'RECALL_PENDING_ACK', severity: r.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH', title: `${row.facility.name} has not acknowledged recall ${r.recallNo}`, detail: `${row.onHandQty} on hand. ${r.instruction}`, slaHours: 12 }, { geoPath: row.facility.geoPath, facility: row.facility, entity: { kind: 'RECALL', id, label: r.recallNo }, link: `/quality/recalls/${id}` }, new Date());
  audit(s, a, 'quality.recall_initiated', { kind: 'RECALL', id, label: r.recallNo });
  return withStats(r);
}, 'recall:manage');
route('POST', '/quality/recalls/:id/acknowledgements', (ctx) => {
  const s = ctx.s;
  const r = s.recalls.find((x) => x.id === ctx.params.id)!;
  const row = r.affected.find((a) => a.facility.id === ctx.body.facilityId);
  if (!row) throw notFound('Facility on this recall');
  if (!facilityAllowed(ctx, row.facility.id)) throw conflict('You can acknowledge only for your own facility');
  if (row.acknowledged) throw conflict('Already acknowledged');
  Object.assign(row, { acknowledged: true, acknowledgedAt: nowIso(), acknowledgedBy: actor(ctx), quarantinedQty: Number(ctx.body.quarantinedQty) });
  r.status = 'IN_PROGRESS';
  for (const l of r.lots) trace(s, { type: 'RECALL_ACKNOWLEDGED', occurredAt: nowIso(), lotId: l.id, lotCode: l.code, quantity: Number(ctx.body.quarantinedQty), quantityKind: 'NONE', facility: row.facility, refs: { recallId: r.id }, actor: actor(ctx), note: ctx.body.note });
  autoResolve(s, `RECALL:${r.id}:${row.facility.id}`, 'Acknowledged');
  return withStats(r);
}, 'recall:acknowledge');
route('POST', '/quality/recalls/:id/close', (ctx) => {
  const r = ctx.s.recalls.find((x) => x.id === ctx.params.id)!;
  const pending = r.affected.filter((a) => !a.acknowledged && a.onHandQty > 0);
  if (pending.length) throw conflict(`${pending.length} facilities holding stock have not acknowledged yet`);
  r.status = 'CLOSED';
  r.closedAt = nowIso();
  for (const l of r.lots) trace(ctx.s, { type: 'RECALL_CLOSED', occurredAt: r.closedAt, lotId: l.id, lotCode: l.code, quantity: 0, quantityKind: 'NONE', refs: { recallId: r.id }, actor: actor(ctx), note: ctx.body.note });
  return withStats(r);
}, 'recall:manage');
