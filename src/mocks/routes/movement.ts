import {
  DOC_PREFIX, handoverSchema, indentCreateSchema, OPEN_INDENT_STATUSES, qtyLabel, round, stopFailSchema, tripCreateSchema,
  type IndentDto, type IndentStatus, type LastMileBoardDto, type TripDto,
} from '@nt/domain';
import { audit, conflict, facRef, facility, forbidden, invalid, newId, nextNo, notFound } from '../ops';
import { actor, facilityAllowed, inScope, includes, paginate, route, type Ctx } from '../server';
import { dispatchShipment } from './supply';

const nowIso = () => new Date().toISOString();
const visible = (ctx: Ctx, paths: string[], ids: string[]) => (ctx.user.facilityId ? ids.includes(ctx.user.facilityId) : paths.some((p) => inScope(ctx, p)) || ctx.user.geoPath === ctx.s.tenant.id);
const indentVisible = (ctx: Ctx, i: IndentDto) => visible(ctx, [i.requesting.geoPath, i.supplying.geoPath], [i.requesting.id, i.supplying.id]);
const tripVisible = (ctx: Ctx, t: TripDto) => visible(ctx, [t.origin.geoPath, ...t.stops.map((s) => s.facility.geoPath)], [t.origin.id, ...t.stops.map((s) => s.facility.id)]);
const push = (ctx: Ctx, i: IndentDto, status: IndentStatus, comment?: string) => { i.status = status; i.history.push({ status, at: nowIso(), actor: actor(ctx), comment }); };
const progress = (t: TripDto) => (t.progress = { total: t.stops.length, delivered: t.stops.filter((x) => x.status === 'DELIVERED').length, failed: t.stops.filter((x) => x.status === 'FAILED').length });
const maybeComplete = (t: TripDto) => { progress(t); if (t.status === 'IN_PROGRESS' && t.stops.every((x) => x.status === 'DELIVERED' || x.status === 'FAILED')) { t.status = 'COMPLETED'; t.completedAt = nowIso(); } };

/* ── Indents ── */
route('GET', '/logistics/indents', (ctx) => {
  const q = ctx.query;
  const fid = q.facilityId ?? ctx.user.facilityId;
  return paginate(ctx.s.indents.filter((i) => indentVisible(ctx, i) && (!q.status || i.status === q.status) && (!q.open || OPEN_INDENT_STATUSES.includes(i.status))
    && (!q.direction || !fid || (q.direction === 'outbound' ? i.requesting.id === fid : i.supplying.id === fid))
    && (!q.q || includes(i.indentNo, q.q) || includes(i.requesting.name, q.q) || includes(i.supplying.name, q.q))), q, 'createdAt');
}, 'indent:read');
route('GET', '/logistics/indents/:id', (ctx) => { const i = ctx.s.indents.find((x) => x.id === ctx.params.id); if (!i || !indentVisible(ctx, i)) throw notFound('Indent'); return i; }, 'indent:read');
route('POST', '/logistics/indents', (ctx) => {
  const r = indentCreateSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const b = r.data;
  const req = facility(ctx.s, b.requestingFacilityId);
  const sup = facility(ctx.s, b.supplyingFacilityId);
  if (!facilityAllowed(ctx, req.id)) throw forbidden('You can raise indents only for your own facility');
  if (req.id === sup.id) throw invalid('A facility cannot request from itself');
  if (sup.type === 'SCHOOL') throw invalid('Schools do not supply other facilities');
  const i: IndentDto = {
    id: newId(ctx.s), indentNo: nextNo(ctx.s, DOC_PREFIX.INDENT, new Date()), requesting: facRef(req), supplying: facRef(sup), neededBy: b.neededBy, reason: b.reason, notes: b.notes, status: 'SUBMITTED',
    lines: b.lines.map((l) => { const c = ctx.s.commodities.find((x) => x.id === l.commodityId)!; return { commodityId: c.id, commodityName: c.name, unit: c.unit, requested: l.quantity, approved: 0, shipped: 0, received: 0 }; }),
    shipmentIds: [], history: [], createdAt: nowIso(), createdBy: actor(ctx),
  };
  push(ctx, i, 'SUBMITTED');
  ctx.s.indents.unshift(i);
  audit(ctx.s, actor(ctx), 'logistics.indent_raised', { kind: 'INDENT', id: i.id, label: i.indentNo });
  return i;
}, 'indent:create');
route('POST', '/logistics/indents/:id/decision', (ctx) => {
  const i = ctx.s.indents.find((x) => x.id === ctx.params.id);
  if (!i) throw notFound('Indent');
  if (i.status !== 'SUBMITTED') throw conflict('This indent has already been decided');
  if (ctx.user.facilityId && ctx.user.facilityId !== i.supplying.id) throw forbidden('Only the supplying facility can decide this indent');
  if (i.createdBy.userId === ctx.user.id) throw forbidden('You cannot approve your own indent');
  if (ctx.body.decision === 'REJECT' && !ctx.body.comment) throw invalid('Give a reason for rejecting');
  for (const l of i.lines) l.approved = ctx.body.decision === 'REJECT' ? 0 : round((ctx.body.approved as { commodityId: string; quantity: number }[] | undefined)?.find((a) => a.commodityId === l.commodityId)?.quantity ?? l.requested);
  push(ctx, i, ctx.body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', ctx.body.comment);
  audit(ctx.s, actor(ctx), `logistics.indent_${String(ctx.body.decision).toLowerCase()}d`, { kind: 'INDENT', id: i.id, label: i.indentNo });
  return i;
}, 'indent:approve');
route('POST', '/logistics/indents/:id/cancel', (ctx) => {
  const i = ctx.s.indents.find((x) => x.id === ctx.params.id)!;
  if (i.shipmentIds.length) throw conflict('Stock has already been shipped against this indent');
  push(ctx, i, 'CANCELLED', ctx.body.reason);
  return i;
}, 'indent:create');

/* ── Trips ── */
route('GET', '/logistics/trips', (ctx) => paginate(ctx.s.trips.filter((t) => tripVisible(ctx, t) && (!ctx.query.status || t.status === ctx.query.status)), ctx.query, 'plannedStartAt'), 'trip:read');
route('GET', '/logistics/trips/:id', (ctx) => { const t = ctx.s.trips.find((x) => x.id === ctx.params.id); if (!t || !tripVisible(ctx, t)) throw notFound('Trip'); return t; }, 'trip:read');
route('POST', '/logistics/trips', (ctx) => {
  const r = tripCreateSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const b = r.data;
  const origin = facility(ctx.s, b.originFacilityId);
  const ships = b.shipmentIds.map((id) => ctx.s.shipments.find((x) => x.id === id) ?? (() => { throw notFound('A selected shipment'); })());
  for (const sh of ships) {
    if (sh.from.id !== origin.id) throw invalid(`${sh.shipmentNo} does not leave from ${origin.name}`);
    if (sh.status !== 'PLANNED') throw conflict(`${sh.shipmentNo} is ${sh.status.toLowerCase()}; only planned shipments can join a trip`);
    if (sh.tripId) throw conflict(`${sh.shipmentNo} is already on trip ${sh.tripNo}`);
  }
  const t: TripDto = {
    id: newId(ctx.s), tripNo: nextNo(ctx.s, DOC_PREFIX.TRIP, new Date()), origin: facRef(origin), vehicleNo: b.vehicleNo, driverName: b.driverName, driverPhone: b.driverPhone, status: 'PLANNED', plannedStartAt: b.plannedStartAt,
    stops: ships.map((sh, i) => ({ seq: i + 1, shipmentId: sh.id, shipmentNo: sh.shipmentNo, facility: sh.to, status: 'PENDING', lineSummary: sh.lines.map((l) => `${l.commodityName.split(' ')[0]} ${qtyLabel(l.dispatchedQty, l.unit)}`).join(', ') })),
    progress: { total: ships.length, delivered: 0, failed: 0 }, createdBy: actor(ctx), createdAt: nowIso(),
  };
  for (const sh of ships) { sh.tripId = t.id; sh.tripNo = t.tripNo; }
  ctx.s.trips.unshift(t);
  audit(ctx.s, actor(ctx), 'logistics.trip_planned', { kind: 'TRIP', id: t.id, label: t.tripNo });
  return t;
}, 'trip:manage');
const tripOr404 = (ctx: Ctx) => { const t = ctx.s.trips.find((x) => x.id === ctx.params.id); if (!t) throw notFound('Trip'); return t; };
const stopOf = (ctx: Ctx, t: TripDto) => { const st = t.stops.find((x) => x.seq === Number(ctx.params.seq)); if (!st) throw notFound('Stop'); return st; };
route('POST', '/logistics/trips/:id/start', (ctx) => {
  const t = tripOr404(ctx);
  if (t.status !== 'PLANNED') throw conflict('Trip has already started');
  for (const st of t.stops) {
    const sh = ctx.s.shipments.find((x) => x.id === st.shipmentId)!;
    if (sh.status === 'PLANNED') dispatchShipment(ctx, sh, { vehicleNo: t.vehicleNo, driverName: t.driverName, driverPhone: t.driverPhone }, `Trip ${t.tripNo}, stop ${st.seq}`);
  }
  t.status = 'IN_PROGRESS';
  t.startedAt = nowIso();
  return t;
}, 'trip:run');
route('POST', '/logistics/trips/:id/stops/:seq/arrive', (ctx) => {
  const t = tripOr404(ctx);
  const st = stopOf(ctx, t);
  if (t.status !== 'IN_PROGRESS') throw conflict('Start the trip first');
  if (st.status !== 'PENDING') throw conflict('Already arrived at this stop');
  st.status = 'ARRIVED';
  st.arrivedAt = nowIso();
  const sh = ctx.s.shipments.find((x) => x.id === st.shipmentId);
  if (sh && ['DISPATCHED', 'IN_TRANSIT', 'DELAYED'].includes(sh.status)) {
    sh.status = 'ARRIVED'; sh.arrivedAt = st.arrivedAt;
    const geo = (ctx.body?.geo as { lat: number; lng: number } | undefined) ?? ctx.s.facilityById.get(st.facility.id)?.location;
    if (geo) sh.lastLocation = { ...geo, at: st.arrivedAt, source: 'GPS' };
    sh.milestones.push({ status: 'ARRIVED', at: st.arrivedAt, note: `Trip ${t.tripNo}`, actor: actor(ctx) });
  }
  return t;
}, 'trip:run');
route('POST', '/logistics/trips/:id/stops/:seq/handover', (ctx) => {
  const r = handoverSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const t = tripOr404(ctx);
  const st = stopOf(ctx, t);
  if (t.status !== 'IN_PROGRESS' || !['PENDING', 'ARRIVED'].includes(st.status)) throw conflict('This stop cannot be handed over now');
  const now = nowIso();
  st.status = 'DELIVERED'; st.arrivedAt ??= now; st.deliveredAt = now;
  st.pod = { ...(st.pod ?? {}), receivedBy: r.data.receivedBy, receiverRole: r.data.receiverRole, signedAt: now, geo: r.data.geo ?? ctx.s.facilityById.get(st.facility.id)?.location, photoName: r.data.photoName };
  maybeComplete(t);
  audit(ctx.s, actor(ctx), 'logistics.trip_handover', { kind: 'TRIP', id: t.id, label: `${t.tripNo} stop ${st.seq}` }, [{ field: 'receivedBy', to: r.data.receivedBy }]);
  return t;
}, 'trip:run');
route('POST', '/logistics/trips/:id/stops/:seq/fail', (ctx) => {
  const r = stopFailSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const t = tripOr404(ctx);
  const st = stopOf(ctx, t);
  if (t.status !== 'IN_PROGRESS' || st.status === 'DELIVERED') throw conflict('This stop cannot be marked failed');
  st.status = 'FAILED';
  st.failure = { reason: r.data.reason, note: r.data.note, at: nowIso() };
  const sh = ctx.s.shipments.find((x) => x.id === st.shipmentId);
  if (sh) { sh.status = 'DELAYED'; sh.milestones.push({ status: 'DELAYED', at: nowIso(), note: `Delivery failed: ${r.data.reason.toLowerCase().replaceAll('_', ' ')}`, actor: actor(ctx) }); }
  maybeComplete(t);
  return t;
}, 'trip:run');
route('GET', '/logistics/last-mile/board', (ctx) => {
  const date = ctx.query.date!;
  const trips = ctx.s.trips.filter((t) => tripVisible(ctx, t) && t.status !== 'CANCELLED' && (t.plannedStartAt.startsWith(date) || new Date(t.plannedStartAt).toLocaleDateString('en-CA') === date || t.status === 'IN_PROGRESS'));
  const stops = trips.flatMap((t) => t.stops.map((st) => ({ ...st, tripId: t.id, tripNo: t.tripNo, vehicleNo: t.vehicleNo, driverName: t.driverName })));
  const waiting = ctx.s.shipments.filter((sh) => sh.to.type === 'SCHOOL' && ['PLANNED', 'DISPATCHED', 'IN_TRANSIT', 'DELAYED'].includes(sh.status) && !sh.tripId && (ctx.user.facilityId ? [sh.from.id, sh.to.id].includes(ctx.user.facilityId) : sh.geoPaths.some((g) => inScope(ctx, g))));
  const board: LastMileBoardDto = {
    date,
    totals: { stops: stops.length, delivered: stops.filter((x) => x.status === 'DELIVERED').length, pending: stops.filter((x) => x.status === 'PENDING' || x.status === 'ARRIVED').length, failed: stops.filter((x) => x.status === 'FAILED').length, trips: trips.length, tripsActive: trips.filter((t) => t.status === 'IN_PROGRESS').length, awaitingTrip: waiting.length },
    stops, awaitingTrip: waiting.map((sh) => ({ shipmentId: sh.id, shipmentNo: sh.shipmentNo, to: sh.to, from: sh.from as never, status: sh.status, expectedArrivalAt: sh.expectedArrivalAt })),
  };
  return board;
}, 'trip:read');
