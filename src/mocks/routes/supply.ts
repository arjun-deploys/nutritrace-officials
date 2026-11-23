import {
  allocateFefo, asnCreateSchema, daysOfCover, grnCreateSchema, lotCode, OPEN_SHIPMENT_STATUSES, poCreateSchema, round, rules, shipmentCreateSchema,
  type GrnDto, type LotDto, type PoDto, type ShipmentDto, type ShipmentStatus, type StockRowDto, type StockSummaryDto, type Unit,
} from '@nt/domain';
import { audit, autoResolve, available, cell, conflict, facility, facRef, forbidden, invalid, moveStock, newId, nextLotSeq, nextNo, notFound, raise, trace } from '../ops';
import { actor, facilityAllowed, inScope, includes, paginate, route, type Ctx } from '../server';
import type { TenantStore } from '../store';

const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toLocaleDateString('en-CA');
const lotRef = (l: LotDto) => ({ id: l.id, code: l.code, commodityId: l.commodity.id, commodityName: l.commodity.name, unit: l.commodity.unit, expiresOn: l.expiresOn, status: l.status });

/* ────────────── Procurement ────────────── */
const poVisible = (ctx: Ctx, po: PoDto) => inScope(ctx, po.deliverTo.geoPath) || ctx.user.geoPath === ctx.s.tenant.id;
route('GET', '/procurement/purchase-orders', (ctx) => paginate(ctx.s.pos.filter((p) => poVisible(ctx, p) && (!ctx.query.status || p.status === ctx.query.status) && (!ctx.query.supplierId || p.supplier.id === ctx.query.supplierId)
  && (includes(p.poNumber, ctx.query.q) || includes(p.supplier.name, ctx.query.q) || includes(p.contractRef, ctx.query.q))), ctx.query, 'createdAt'), 'po:read');
route('GET', '/procurement/purchase-orders/:id', (ctx) => {
  const po = ctx.s.pos.find((p) => p.id === ctx.params.id);
  if (!po) throw notFound('Purchase order');
  return { ...po, asns: ctx.s.asns.filter((a) => a.poId === po.id) };
}, 'po:read');
route('POST', '/procurement/purchase-orders', (ctx) => {
  const r = poCreateSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const sup = ctx.s.suppliers.find((x) => x.id === r.data.supplierId)!;
  if (sup.status !== 'APPROVED') throw invalid(`${sup.name} is not an approved supplier`);
  const f = facility(ctx.s, r.data.deliverToFacilityId);
  const a = actor(ctx);
  const po: PoDto = {
    id: newId(ctx.s), tenantId: ctx.s.tenant.id, poNumber: nextNo(ctx.s, 'PO', new Date()), supplier: { id: sup.id, name: sup.name, code: sup.code }, deliverTo: facRef(f),
    programmeCode: r.data.programmeCode, contractRef: r.data.contractRef, expectedDeliveryDate: r.data.expectedDeliveryDate, notes: r.data.notes, status: ctx.body.submit ? 'PENDING_APPROVAL' : 'DRAFT',
    lines: r.data.lines.map((l) => { const c = ctx.s.commodities.find((x) => x.id === l.commodityId)!; if (!sup.commodityIds.includes(c.id)) throw invalid(`${sup.name} is not approved to supply ${c.name}`); return { commodityId: c.id, commodityName: c.name, unit: c.unit, quantity: l.quantity, ratePerUnit: l.ratePerUnit, dispatched: 0, received: 0, accepted: 0, rejected: 0 }; }),
    history: [{ status: 'DRAFT', at: nowIso(), actor: a }, ...(ctx.body.submit ? [{ status: 'PENDING_APPROVAL' as const, at: nowIso(), actor: a }] : [])], createdAt: nowIso(), createdBy: a,
  };
  ctx.s.pos.unshift(po);
  audit(ctx.s, a, 'procurement.po_created', { kind: 'PO', id: po.id, label: po.poNumber });
  return po;
}, 'po:create');
route('POST', '/procurement/purchase-orders/:id/decision', (ctx) => {
  const po = ctx.s.pos.find((p) => p.id === ctx.params.id);
  if (!po) throw notFound('Purchase order');
  if (po.status !== 'PENDING_APPROVAL') throw conflict('This order is not awaiting approval');
  if (po.createdBy.userId === ctx.user.id) throw forbidden('You cannot approve an order you created');
  po.status = ctx.body.decision === 'APPROVE' ? 'APPROVED' : 'CANCELLED';
  po.history.push({ status: po.status, at: nowIso(), actor: actor(ctx), comment: ctx.body.comment });
  audit(ctx.s, actor(ctx), `procurement.po_${String(ctx.body.decision).toLowerCase()}d`, { kind: 'PO', id: po.id, label: po.poNumber });
  return po;
}, 'po:approve');
route('POST', '/procurement/purchase-orders/:id/cancel', (ctx) => {
  const po = ctx.s.pos.find((p) => p.id === ctx.params.id)!;
  po.status = 'CANCELLED';
  po.history.push({ status: 'CANCELLED', at: nowIso(), actor: actor(ctx), comment: ctx.body.reason });
  return po;
}, 'po:create');
route('GET', '/procurement/suppliers/:id/performance', (ctx) => {
  const pos = ctx.s.pos.filter((p) => p.supplier.id === ctx.params.id && !['DRAFT', 'CANCELLED'].includes(p.status));
  const asns = ctx.s.asns.filter((a) => pos.some((p) => p.id === a.poId));
  const lines = pos.flatMap((p) => p.lines);
  const sum = (k: 'quantity' | 'received' | 'accepted') => lines.reduce((a, l) => a + l[k], 0);
  const pct = (a: number, b: number) => (b ? round((a / b) * 100, 1) : 0);
  const onTime = asns.filter((a) => a.expectedArrivalAt.slice(0, 10) <= (pos.find((p) => p.id === a.poId)?.expectedDeliveryDate ?? '')).length;
  return { orders: pos.length, lotsSupplied: asns.reduce((a, x) => a + x.lots.length, 0), ordered: sum('quantity'), received: sum('received'), accepted: sum('accepted'), onTimePct: pct(onTime, asns.length), inFullPct: pct(sum('accepted'), pos.filter((p) => p.status === 'FULFILLED').flatMap((p) => p.lines).reduce((a, l) => a + l.quantity, 0) || sum('quantity')), qualityPassPct: pct(sum('accepted'), sum('received')) };
}, 'po:read');

route('POST', '/procurement/asns', (ctx) => {
  const r = asnCreateSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const s = ctx.s;
  const po = s.pos.find((p) => p.id === r.data.poId)!;
  if (!['APPROVED', 'PARTIALLY_FULFILLED'].includes(po.status)) throw conflict('Goods can be dispatched only against an approved order');
  const sup = s.suppliers.find((x) => x.id === po.supplier.id)!;
  const party = { id: sup.id, name: sup.name, code: sup.code, type: 'SUPPLIER' as const, geoPath: s.tenant.id };
  const shipmentId = newId(s);
  const asnNo = nextNo(s, 'ASN', new Date());
  const a = actor(ctx);
  const lots = r.data.lots.map((l) => {
    const c = s.commodities.find((x) => x.id === l.commodityId)!;
    const line = po.lines.find((x) => x.commodityId === c.id);
    if (!line) throw invalid('A lot is for a commodity not on this order');
    if (line.dispatched + l.quantity > line.quantity * 1.02) throw invalid(`${c.name}: dispatch would exceed the ordered ${line.quantity}`);
    line.dispatched = round(line.dispatched + l.quantity);
    const lot: LotDto = {
      id: newId(s), tenantId: s.tenant.id, code: lotCode(c.code, s.tenant.code, nextLotSeq(s, c.code)), commodity: { id: c.id, name: c.name, code: c.code, unit: c.unit, category: c.category }, supplier: { id: sup.id, name: sup.name, code: sup.code },
      supplierLotNo: l.supplierLotNo, poId: po.id, poNumber: po.poNumber, origin: { district: l.originDistrict, state: l.originState }, packedOn: l.packedOn, expiresOn: l.expiresOn, quantity: l.quantity,
      status: 'PENDING_QC', certificateNo: l.certificateNo || undefined, currentStage: 'SOURCE', completeness: 0, createdAt: nowIso(),
    };
    s.lots.push(lot);
    s.lotById.set(lot.id, lot);
    trace(s, { type: 'LOT_CREATED', occurredAt: r.data.dispatchedAt, lotId: lot.id, lotCode: lot.code, commodityId: c.id, quantity: l.quantity, unit: c.unit, quantityKind: 'PROCURED', from: party, refs: { poId: po.id, poNumber: po.poNumber }, actor: a });
    trace(s, { type: 'DISPATCHED', occurredAt: r.data.dispatchedAt, lotId: lot.id, lotCode: lot.code, commodityId: c.id, quantity: l.quantity, unit: c.unit, quantityKind: 'DISPATCHED', from: party, to: po.deliverTo, refs: { poId: po.id, poNumber: po.poNumber, shipmentId, shipmentNo: asnNo }, actor: a, note: `Invoice ${r.data.invoiceNo}, vehicle ${r.data.vehicleNo}` });
    return lot;
  });
  const asn = { id: shipmentId, asnNo, poId: po.id, invoiceNo: r.data.invoiceNo, vehicleNo: r.data.vehicleNo, dispatchedAt: r.data.dispatchedAt, expectedArrivalAt: r.data.expectedArrivalAt, lots: lots.map((l) => ({ lotId: l.id, lotCode: l.code, commodityName: l.commodity.name, unit: l.commodity.unit, quantity: l.quantity, supplierLotNo: l.supplierLotNo, expiresOn: l.expiresOn })) };
  s.asns.unshift(asn);
  s.shipments.unshift({
    id: shipmentId, tenantId: s.tenant.id, shipmentNo: asnNo, origin: 'SUPPLIER', from: party, to: po.deliverTo, poId: po.id, poNumber: po.poNumber, purpose: 'REPLENISHMENT', status: 'DISPATCHED',
    lines: lots.map((l) => ({ lotId: l.id, lotCode: l.code, commodityId: l.commodity.id, commodityName: l.commodity.name, unit: l.commodity.unit, dispatchedQty: l.quantity })),
    vehicle: { registrationNo: r.data.vehicleNo, driverName: r.data.driverName, driverPhone: r.data.driverPhone }, plannedDispatchAt: r.data.dispatchedAt, dispatchedAt: r.data.dispatchedAt, expectedArrivalAt: r.data.expectedArrivalAt,
    delayHours: 0, hasDiscrepancy: false, milestones: [{ status: 'DISPATCHED', at: r.data.dispatchedAt, note: 'Supplier dispatch (ASN)', actor: a }], totalQtyByUnit: {}, createdAt: nowIso(), geoPaths: [po.deliverTo.geoPath],
  });
  audit(s, a, 'procurement.asn_created', { kind: 'ASN', id: shipmentId, label: asnNo });
  return asn;
}, 'asn:create');

/* ────────────── Inventory ────────────── */
function stockRows(ctx: Ctx) {
  const rows: StockRowDto[] = [];
  for (const c of ctx.s.stock.values()) {
    const f = ctx.s.facilityById.get(c.facilityId)!;
    if (!inScope(ctx, f.geoPath) || !facilityAllowed(ctx, f.id)) continue;
    const lot = ctx.s.lotById.get(c.lotId)!;
    rows.push({ id: `${c.facilityId}|${c.lotId}`, facility: facRef(f), lot: lotRef(lot), onHand: c.onHand, reserved: c.reserved, available: available(c), receivedAt: c.receivedAt, lastMovementAt: c.lastMovementAt });
  }
  return rows;
}
route('GET', '/inventory/stock', (ctx) => {
  const q = ctx.query;
  const expiryLimit = new Date(Date.now() + ctx.s.tenant.config.thresholds.expiryWarningDays * 86_400_000).toLocaleDateString('en-CA');
  return paginate(stockRows(ctx).filter((r) => (q.includeEmpty || r.onHand > 0) && (!q.facilityId || r.facility.id === q.facilityId) && (!q.commodityId || r.lot.commodityId === q.commodityId)
    && (!q.lotStatus || r.lot.status === q.lotStatus) && (!q.nearExpiry || r.lot.expiresOn <= expiryLimit) && (!q.q || includes(r.lot.code, q.q) || includes(r.facility.name, q.q) || includes(r.lot.commodityName, q.q))), q, 'lot.expiresOn');
}, 'stock:read');
route('GET', '/inventory/stock/summary', (ctx) => {
  const rows = stockRows(ctx).filter((r) => r.onHand > 0 && (!ctx.query.facilityId || r.facility.id === ctx.query.facilityId));
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const expiryLimit = new Date(Date.now() + ctx.s.tenant.config.thresholds.expiryWarningDays * 86_400_000).toLocaleDateString('en-CA');
  const used = new Map<string, number>();
  for (const l of ctx.s.ledger) if (l.type === 'ISSUE' && l.at >= since) {
    const f = ctx.s.facilityById.get(l.facilityId)!;
    if (inScope(ctx, f.geoPath) && facilityAllowed(ctx, f.id)) used.set(l.commodityName, (used.get(l.commodityName) ?? 0) - l.quantity);
  }
  const groups = new Map<string, StockRowDto[]>();
  for (const r of rows) groups.set(r.lot.commodityId, [...(groups.get(r.lot.commodityId) ?? []), r]);
  return [...groups.values()].map<StockSummaryDto>((g) => {
    const l = g[0]!.lot;
    const onHold = g.filter((r) => r.lot.status !== 'RELEASED').reduce((a, r) => a + r.onHand, 0);
    const avail = round(g.reduce((a, r) => a + r.available, 0) - onHold);
    const avg = round((used.get(l.commodityName) ?? 0) / 14, 2);
    return { commodityId: l.commodityId, commodityName: l.commodityName, unit: l.unit, onHand: round(g.reduce((a, r) => a + r.onHand, 0)), available: avail, onHold: round(onHold), nearExpiry: round(g.filter((r) => r.lot.expiresOn <= expiryLimit).reduce((a, r) => a + r.onHand, 0)), lots: new Set(g.map((r) => r.lot.id)).size, facilities: new Set(g.map((r) => r.facility.id)).size, avgDailyConsumption: avg, daysOfCover: daysOfCover(avail, avg) };
  }).sort((a, b) => (a.daysOfCover ?? 999) - (b.daysOfCover ?? 999));
}, 'stock:read');
route('GET', '/inventory/stock/fefo', (ctx) => {
  const rows = stockRows(ctx).filter((r) => r.facility.id === ctx.query.facilityId && r.lot.commodityId === ctx.query.commodityId);
  return allocateFefo(rows.map((r) => ({ lotId: r.lot.id, lotCode: r.lot.code, expiresOn: r.lot.expiresOn, receivedAt: r.receivedAt, available: r.available, status: r.lot.status })), Number(ctx.query.quantity), todayStr());
}, 'stock:read');
route('GET', '/inventory/ledger', (ctx) => paginate(ctx.s.ledger.filter((l) => {
  const f = ctx.s.facilityById.get(l.facilityId)!;
  return inScope(ctx, f.geoPath) && facilityAllowed(ctx, f.id) && (!ctx.query.facilityId || l.facilityId === ctx.query.facilityId) && (!ctx.query.lotId || l.lotId === ctx.query.lotId) && (!ctx.query.type || l.type === ctx.query.type);
}), ctx.query, 'at'), 'stock:read');
route('GET', '/inventory/receipts', (ctx) => paginate(ctx.s.grns.filter((g) => inScope(ctx, g.facility.geoPath) && facilityAllowed(ctx, g.facility.id) && (!ctx.query.discrepancy || g.hasDiscrepancy) && (includes(g.grnNo, ctx.query.q) || includes(g.shipmentNo, ctx.query.q))), ctx.query, 'receivedAt'), 'stock:read');

export function receiveShipment(s: TenantStore, ctx: Ctx, body: unknown) {
  const r = grnCreateSchema.safeParse(body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const b = r.data;
  const sh = s.shipments.find((x) => x.id === b.shipmentId);
  if (!sh) throw notFound('Shipment');
  if (sh.to.id !== b.facilityId || !facilityAllowed(ctx, b.facilityId)) throw forbidden('This shipment is addressed to a different facility');
  if (!OPEN_SHIPMENT_STATUSES.includes(sh.status) || sh.status === 'PLANNED') throw conflict(`Shipment is ${sh.status.toLowerCase().replace('_', ' ')} and cannot be received`);
  const to = facility(s, b.facilityId);
  const grnId = newId(s);
  const grnNo = nextNo(s, 'GRN', new Date());
  const a = actor(ctx);
  const lines: GrnDto['lines'] = b.lines.map((l) => {
    const sl = sh.lines.find((x) => x.lotId === l.lotId);
    if (!sl) throw invalid('A received lot is not on this shipment');
    if (l.acceptedQty > 0) moveStock(s, { facilityId: to.id, lotId: l.lotId, type: 'RECEIPT', onHandDelta: l.acceptedQty, ref: { kind: 'GRN', id: grnId, label: grnNo }, at: b.receivedAt, actor: a });
    Object.assign(sl, { receivedQty: l.receivedQty, acceptedQty: l.acceptedQty, rejectedQty: l.rejectedQty });
    const base = { occurredAt: b.receivedAt, lotId: l.lotId, lotCode: sl.lotCode, commodityId: sl.commodityId, unit: sl.unit, from: sh.from, to: facRef(to), refs: { shipmentId: sh.id, shipmentNo: sh.shipmentNo, grnId, poId: sh.poId, poNumber: sh.poNumber }, actor: a, geo: to.location };
    trace(s, { ...base, type: 'RECEIVED', quantity: l.receivedQty, quantityKind: 'RECEIVED', note: `${grnNo}; expected ${l.expectedQty}` });
    trace(s, { ...base, type: 'RECEIVED', quantity: l.acceptedQty, quantityKind: 'ACCEPTED' });
    if (l.rejectedQty > 0) trace(s, { ...base, type: 'RECEIVED', quantity: l.rejectedQty, quantityKind: 'REJECTED', note: l.rejectionReason });
    if (sh.poId) {
      const po = s.pos.find((p) => p.id === sh.poId);
      const pl = po?.lines.find((x) => x.commodityId === sl.commodityId);
      if (po && pl) { pl.received += l.receivedQty; pl.accepted += l.acceptedQty; pl.rejected += l.rejectedQty; po.status = po.lines.every((x) => x.accepted >= x.quantity * 0.995) ? 'FULFILLED' : 'PARTIALLY_FULFILLED'; }
    }
    return { ...l, lotCode: sl.lotCode, commodityName: sl.commodityName, unit: sl.unit };
  });
  const cfg = s.tenant.config;
  const hasDiscrepancy = lines.some((l) => !!rules.receiptVariance(l.expectedQty, l.receivedQty, cfg, '', l.unit) || l.rejectedQty > 0) || !b.sealIntact;
  const grn: GrnDto = { id: grnId, grnNo, facility: facRef(to), shipmentId: sh.id, shipmentNo: sh.shipmentNo, receivedAt: b.receivedAt, sealIntact: b.sealIntact, remarks: b.remarks, hasDiscrepancy, lines, receivedBy: a };
  s.grns.unshift(grn);
  sh.status = hasDiscrepancy ? 'PARTIALLY_RECEIVED' : 'RECEIVED';
  sh.receivedAt = b.receivedAt;
  sh.grnId = grnId;
  sh.hasDiscrepancy = hasDiscrepancy;
  sh.milestones.push({ status: sh.status, at: b.receivedAt, note: hasDiscrepancy ? 'Received with discrepancy' : 'Received in full', actor: a });
  autoResolve(s, `DELAY:${sh.id}`, 'Shipment received');
  if (sh.indentId) {
    const ind = s.indents.find((i) => i.id === sh.indentId);
    if (ind) for (const l of lines) { const cid = sh.lines.find((x) => x.lotId === l.lotId)?.commodityId; const il = ind.lines.find((x) => x.commodityId === cid); if (il) il.received = round(il.received + l.acceptedQty); }
  }
  const trip = s.trips.find((t) => t.stops.some((st) => st.shipmentId === sh.id));
  if (trip) {
    const stop = trip.stops.find((st) => st.shipmentId === sh.id)!;
    stop.pod = { ...(stop.pod ?? { receivedBy: a.name, signedAt: b.receivedAt }), grnId, grnNo, hasDiscrepancy };
    if (stop.status !== 'DELIVERED') { stop.status = 'DELIVERED'; stop.deliveredAt = b.receivedAt; stop.arrivedAt ??= b.receivedAt; }
    trip.progress = { total: trip.stops.length, delivered: trip.stops.filter((x) => x.status === 'DELIVERED').length, failed: trip.stops.filter((x) => x.status === 'FAILED').length };
    if (trip.status === 'IN_PROGRESS' && trip.stops.every((x) => x.status === 'DELIVERED' || x.status === 'FAILED')) { trip.status = 'COMPLETED'; trip.completedAt = nowIso(); }
  }
  for (const l of lines) {
    const c = rules.receiptVariance(l.expectedQty, l.receivedQty, cfg, `${l.lotCode} (${sh.shipmentNo})`, l.unit);
    if (c) raise(s, `MISMATCH:${sh.id}:${l.lotCode}`, c, { geoPath: to.geoPath, facility: facRef(to), entity: { kind: 'SHIPMENT', id: sh.id, label: sh.shipmentNo }, link: `/logistics/shipments/${sh.id}` }, new Date());
  }
  audit(s, a, 'inventory.grn_posted', { kind: 'GRN', id: grnId, label: grnNo });
  return grn;
}
route('POST', '/inventory/receipts', (ctx) => {
  const prior = ctx.s.grns.find((g) => g.shipmentId === ctx.body?.shipmentId);
  if (prior && ctx.idempotencyKey) return prior;
  return receiveShipment(ctx.s, ctx, ctx.body);
}, 'grn:create');

route('GET', '/inventory/adjustments', (ctx) => paginate(ctx.s.adjustments.filter((a) => inScope(ctx, a.facility.geoPath) && facilityAllowed(ctx, a.facility.id) && (!ctx.query.status || a.status === ctx.query.status)), ctx.query, 'requestedAt'), 'stock:read');
route('POST', '/inventory/adjustments', (ctx) => {
  const f = facility(ctx.s, ctx.body.facilityId);
  const c = cell(ctx.s, f.id, ctx.body.lotId);
  if (!c) throw notFound('Stock for this lot at this facility');
  const delta = Number(ctx.body.quantityDelta);
  if (delta < 0 && available(c) + delta < 0) throw conflict('Adjustment would take available stock below zero');
  const lot = ctx.s.lotById.get(ctx.body.lotId)!;
  const adj = { id: newId(ctx.s), adjNo: nextNo(ctx.s, 'ADJ', new Date()), facility: facRef(f), lot: lotRef(lot), quantityDelta: delta, reason: ctx.body.reason, remarks: ctx.body.remarks, status: 'PENDING' as const, requestedBy: actor(ctx), requestedAt: nowIso() };
  ctx.s.adjustments.unshift(adj);
  audit(ctx.s, actor(ctx), 'inventory.adjustment_requested', { kind: 'ADJUSTMENT', id: adj.id, label: adj.adjNo });
  return adj;
}, 'stock:adjust');
route('POST', '/inventory/adjustments/:id/decision', (ctx) => {
  const adj = ctx.s.adjustments.find((a) => a.id === ctx.params.id);
  if (!adj) throw notFound('Adjustment');
  if (adj.status !== 'PENDING') throw conflict('Already decided');
  if (adj.requestedBy.userId === ctx.user.id) throw forbidden('A different officer must approve this adjustment');
  adj.status = ctx.body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  Object.assign(adj, { decidedBy: actor(ctx), decidedAt: nowIso(), decisionComment: ctx.body.comment });
  if (adj.status === 'APPROVED') {
    moveStock(ctx.s, { facilityId: adj.facility.id, lotId: adj.lot.id, type: 'ADJUSTMENT', onHandDelta: adj.quantityDelta, ref: { kind: 'ADJUSTMENT', id: adj.id, label: adj.adjNo }, at: nowIso(), actor: actor(ctx) });
    trace(ctx.s, { type: 'ADJUSTED', occurredAt: nowIso(), lotId: adj.lot.id, lotCode: adj.lot.code, commodityId: adj.lot.commodityId, quantity: adj.quantityDelta, unit: adj.lot.unit, quantityKind: 'ADJUSTED', facility: adj.facility, refs: { adjustmentId: adj.id }, actor: actor(ctx), note: `${adj.reason}: ${adj.remarks}` });
  }
  audit(ctx.s, actor(ctx), `inventory.adjustment_${adj.status.toLowerCase()}`, { kind: 'ADJUSTMENT', id: adj.id, label: adj.adjNo });
  return adj;
}, 'stock:adjust:approve');

/* ────────────── Logistics ────────────── */
const shipmentVisible = (ctx: Ctx, sh: ShipmentDto & { geoPaths: string[] }) => (ctx.user.facilityId ? sh.from.id === ctx.user.facilityId || sh.to.id === ctx.user.facilityId : sh.geoPaths.some((g) => inScope(ctx, g)));
const liveDelay = (sh: ShipmentDto) => (OPEN_SHIPMENT_STATUSES.includes(sh.status) && sh.status !== 'PLANNED' && new Date(sh.expectedArrivalAt).getTime() < Date.now() ? round((Date.now() - new Date(sh.expectedArrivalAt).getTime()) / 3_600_000, 1) : sh.delayHours);
const view = (sh: ShipmentDto) => ({ ...sh, delayHours: liveDelay(sh) });

route('GET', '/logistics/shipments', (ctx) => {
  const q = ctx.query;
  const fid = q.facilityId ?? ctx.user.facilityId;
  return paginate(ctx.s.shipments.filter((sh) => shipmentVisible(ctx, sh) && (!q.status || sh.status === q.status) && (!q.open || OPEN_SHIPMENT_STATUSES.includes(sh.status)) && (!q.discrepancy || sh.hasDiscrepancy)
    && (!q.direction || !fid || (q.direction === 'inbound' ? sh.to.id === fid : sh.from.id === fid))
    && (!q.q || includes(sh.shipmentNo, q.q) || includes(sh.vehicle?.registrationNo, q.q) || includes(sh.to.name, q.q) || sh.lines.some((l) => includes(l.lotCode, q.q)))).map(view), q, 'createdAt');
}, 'shipment:read');
route('GET', '/logistics/shipments/:id', (ctx) => {
  const sh = ctx.s.shipments.find((x) => x.id === ctx.params.id);
  if (!sh || !shipmentVisible(ctx, sh)) throw notFound('Shipment');
  return view(sh);
}, 'shipment:read');
route('POST', '/logistics/shipments', (ctx) => {
  const r = shipmentCreateSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const s = ctx.s;
  const from = facility(s, r.data.fromFacilityId);
  const to = facility(s, r.data.toFacilityId);
  if (!facilityAllowed(ctx, from.id)) throw forbidden('You can only ship from your own facility');
  const id = newId(s);
  const shipmentNo = nextNo(s, 'SHP', new Date());
  const a = actor(ctx);
  const lines = r.data.lines.map((l) => {
    const lot = s.lotById.get(l.lotId)!;
    moveStock(s, { facilityId: from.id, lotId: l.lotId, type: 'RESERVATION', onHandDelta: 0, reservedDelta: l.quantity, ref: { kind: 'SHIPMENT', id, label: shipmentNo }, at: nowIso(), actor: a, requireReleased: true });
    return { lotId: lot.id, lotCode: lot.code, commodityId: lot.commodity.id, commodityName: lot.commodity.name, unit: lot.commodity.unit as Unit, dispatchedQty: l.quantity };
  });
  s.reservations.set(id, { facilityId: from.id, lines: r.data.lines, status: 'ACTIVE' });
  const indent = r.data.indentId ? s.indents.find((i) => i.id === r.data.indentId) : undefined;
  if (r.data.indentId) {
    if (!indent) throw notFound('Indent');
    if (indent.supplying.id !== from.id || indent.requesting.id !== to.id) throw invalid('This shipment does not match the indent’s supplier and requester');
    if (!['APPROVED', 'PARTIALLY_FULFILLED'].includes(indent.status)) throw conflict('The indent must be approved before it is fulfilled');
    for (const l of lines) { const il = indent.lines.find((x) => x.commodityId === l.commodityId); if (il) il.shipped = round(il.shipped + l.dispatchedQty); }
    indent.shipmentIds.push(id);
    indent.status = indent.lines.every((l) => l.shipped >= l.approved - 1e-6) ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
  }
  const sh = { id, tenantId: s.tenant.id, shipmentNo, origin: 'FACILITY' as const, from: facRef(from), to: facRef(to), purpose: r.data.purpose, indentId: indent?.id, indentNo: indent?.indentNo, status: 'PLANNED' as ShipmentStatus, lines, plannedDispatchAt: r.data.plannedDispatchAt, expectedArrivalAt: r.data.expectedArrivalAt, delayHours: 0, hasDiscrepancy: false, milestones: [{ status: 'PLANNED' as ShipmentStatus, at: nowIso(), actor: a, note: indent ? `Fulfils indent ${indent.indentNo}` : undefined }], totalQtyByUnit: {}, createdAt: nowIso(), geoPaths: [from.geoPath, to.geoPath] };
  s.shipments.unshift(sh);
  audit(s, a, 'logistics.shipment_planned', { kind: 'SHIPMENT', id, label: shipmentNo });
  return sh;
}, 'shipment:create');
route('POST', '/logistics/shipments/:id/dispatch', (ctx) => {
  const sh = ctx.s.shipments.find((x) => x.id === ctx.params.id)!;
  if (sh.status !== 'PLANNED') throw conflict('Only planned shipments can be dispatched');
  dispatchShipment(ctx, sh, ctx.body);
  return view(sh);
}, 'shipment:update');

export function dispatchShipment(ctx: Ctx, sh: ShipmentDto & { geoPaths: string[] }, body: { vehicleNo: string; driverName: string; driverPhone: string; transporterName?: string; sealNo?: string }, note?: string) {
  const s = ctx.s;
  ctx.body = body;
  const a = actor(ctx);
  const at = nowIso();
  for (const l of sh.lines) {
    moveStock(s, { facilityId: sh.from.id, lotId: l.lotId, type: 'DISPATCH', onHandDelta: -l.dispatchedQty, reservedDelta: -l.dispatchedQty, ref: { kind: 'SHIPMENT', id: sh.id, label: sh.shipmentNo }, at, actor: a, requireReleased: true });
    trace(s, { type: 'DISPATCHED', occurredAt: at, lotId: l.lotId, lotCode: l.lotCode, commodityId: l.commodityId, quantity: l.dispatchedQty, unit: l.unit, quantityKind: 'DISPATCHED', from: sh.from, to: sh.to, refs: { shipmentId: sh.id, shipmentNo: sh.shipmentNo }, actor: a, note: `Vehicle ${ctx.body.vehicleNo}` });
  }
  s.reservations.get(sh.id)!.status = 'DISPATCHED';
  sh.vehicle = { registrationNo: String(ctx.body.vehicleNo).toUpperCase(), driverName: ctx.body.driverName, driverPhone: ctx.body.driverPhone, transporterName: ctx.body.transporterName };
  sh.status = 'DISPATCHED';
  sh.dispatchedAt = at;
  sh.milestones.push({ status: 'DISPATCHED', at, note: note ?? (ctx.body.sealNo ? `Seal ${ctx.body.sealNo}` : undefined), actor: a });
  audit(s, a, 'logistics.shipment_dispatched', { kind: 'SHIPMENT', id: sh.id, label: sh.shipmentNo });
}
route('POST', '/logistics/shipments/:id/milestones', (ctx) => {
  const sh = ctx.s.shipments.find((x) => x.id === ctx.params.id)!;
  sh.status = ctx.body.status;
  if (sh.status === 'ARRIVED') sh.arrivedAt = nowIso();
  sh.milestones.push({ status: sh.status, at: nowIso(), note: ctx.body.note, actor: actor(ctx) });
  return view(sh);
}, 'shipment:update');
route('POST', '/logistics/shipments/:id/cancel', (ctx) => {
  const sh = ctx.s.shipments.find((x) => x.id === ctx.params.id)!;
  if (sh.status !== 'PLANNED') throw conflict('Only planned shipments can be cancelled');
  for (const l of sh.lines) moveStock(ctx.s, { facilityId: sh.from.id, lotId: l.lotId, type: 'RELEASE_RESERVATION', onHandDelta: 0, reservedDelta: -l.dispatchedQty, ref: { kind: 'SHIPMENT', id: sh.id, label: sh.shipmentNo }, at: nowIso(), actor: actor(ctx) });
  sh.status = 'CANCELLED';
  sh.milestones.push({ status: 'CANCELLED', at: nowIso(), note: ctx.body.reason, actor: actor(ctx) });
  return view(sh);
}, 'shipment:create');
