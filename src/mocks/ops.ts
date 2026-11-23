import {
  BLOCKED_LOT_STATUSES, CUSTODY_STAGES, docNo, GENESIS_HASH, round, sealEvent, stageOfEvent,
  type ActorRef, type ExceptionCandidate, type FacilityDto, type FacilityRef, type LedgerTxnType, type UnhashedEvent,
} from '@nt/domain';
import { SYSTEM, type StockCell, type TenantStore } from './store';

export type MockError = Error & { status: number; code: string; details?: unknown };
export const mockError = (status: number, code: string, message: string, details?: unknown): MockError => Object.assign(new Error(message), { status, code, details });
export const notFound = (what: string) => mockError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (msg: string) => mockError(409, 'CONFLICT', msg);
export const forbidden = (msg = 'You do not have permission for this action') => mockError(403, 'FORBIDDEN', msg);
export const invalid = (msg: string) => mockError(422, 'VALIDATION_FAILED', msg);

/** Deterministic 24-hex ids (look like Mongo ObjectIds). */
export function newId(s: TenantStore) {
  s.counters._id = (s.counters._id ?? 0) + 1;
  return (s.tenant.code.charCodeAt(0).toString(16) + s.counters._id.toString(16)).padStart(24, '0');
}
export function nextNo(s: TenantStore, prefix: string, at: Date | string = s.now) {
  const key = `${prefix}`;
  s.counters[key] = (s.counters[key] ?? 0) + 1;
  return docNo(prefix, s.tenant.code, s.counters[key]!, at);
}
export function nextLotSeq(s: TenantStore, commodityCode: string) {
  const key = `LOT:${commodityCode}`;
  s.counters[key] = (s.counters[key] ?? 0) + 1;
  return s.counters[key]!;
}

export const facRef = (f: FacilityDto): FacilityRef => ({ id: f.id, name: f.name, code: f.code, type: f.type, geoPath: f.geoPath });
export const facility = (s: TenantStore, id: string) => {
  const f = s.facilityById.get(id);
  if (!f) throw notFound('Facility');
  return f;
};

const key = (facilityId: string, lotId: string) => `${facilityId}|${lotId}`;
export const cell = (s: TenantStore, facilityId: string, lotId: string) => s.stock.get(key(facilityId, lotId));
export const available = (c?: StockCell) => (c ? round(c.onHand - c.reserved) : 0);

/** Mirrors inventory-service moveStock: guarded quantity change + immutable ledger row. */
export function moveStock(s: TenantStore, p: {
  facilityId: string; lotId: string; type: LedgerTxnType; onHandDelta: number; reservedDelta?: number; ref: { kind: string; id: string; label: string };
  at: string; actor: ActorRef; requireReleased?: boolean;
}) {
  const lot = s.lotById.get(p.lotId);
  if (!lot) throw notFound('Lot');
  if (p.requireReleased && BLOCKED_LOT_STATUSES.includes(lot.status)) throw mockError(422, 'LOT_BLOCKED', `${lot.code} is ${lot.status.toLowerCase().replace('_', ' ')} and cannot be used`);
  const f = facility(s, p.facilityId);
  let c = cell(s, p.facilityId, p.lotId);
  if (!c) {
    if (p.onHandDelta <= 0) throw conflict(`No stock of ${lot.code} at ${f.name}`);
    c = { facilityId: p.facilityId, lotId: p.lotId, onHand: 0, reserved: 0, receivedAt: p.at, lastMovementAt: p.at };
    s.stock.set(key(p.facilityId, p.lotId), c);
  }
  const rd = p.reservedDelta ?? 0;
  const nextOnHand = c.onHand + p.onHandDelta;
  const nextReserved = c.reserved + rd;
  const freeAfter = nextOnHand - nextReserved;
  if (nextOnHand < -1e-6 || nextReserved < -1e-6 || ((rd > 0 || p.type === 'ISSUE' || (p.type === 'ADJUSTMENT' && p.onHandDelta < 0)) && freeAfter < -1e-6)) {
    throw conflict(`Not enough ${lot.code} at ${f.name}: ${available(c)} ${lot.commodity.unit.toLowerCase()} available`);
  }
  c.onHand = round(nextOnHand);
  c.reserved = round(nextReserved);
  c.lastMovementAt = p.at;
  if (p.onHandDelta !== 0) {
    s.ledger.push({
      id: newId(s), facilityId: p.facilityId, lotId: p.lotId, lotCode: lot.code, commodityName: lot.commodity.name, unit: lot.commodity.unit, type: p.type,
      quantity: round(p.onHandDelta), balanceAfter: c.onHand, ref: p.ref, at: p.at, actor: p.actor,
    });
  }
  return lot;
}

/* ── Custody ledger ── */
export type TraceIn = Omit<UnhashedEvent, 'id' | 'seq' | 'tenantId' | 'recordedAt'>;

export function trace(s: TenantStore, e: TraceIn) {
  const input: UnhashedEvent = { ...e, id: newId(s), seq: 0, tenantId: s.tenant.id, recordedAt: e.occurredAt };
  if (!s.sealed) {
    s.pending.push(input);
    return;
  }
  appendSealed(s, { ...input, recordedAt: new Date().toISOString() });
}

function appendSealed(s: TenantStore, input: UnhashedEvent) {
  const prev = s.events.length ? s.events[s.events.length - 1]!.hash : GENESIS_HASH;
  const sealed = sealEvent({ ...input, seq: s.events.length + 1 }, prev);
  s.events.push(sealed);
  if (sealed.lotId) {
    const arr = s.byLot.get(sealed.lotId) ?? [];
    arr.push(sealed);
    s.byLot.set(sealed.lotId, arr);
    const st = stageOfEvent(sealed);
    const lot = s.lotById.get(sealed.lotId);
    if (lot && st && CUSTODY_STAGES.indexOf(st) > CUSTODY_STAGES.indexOf(lot.currentStage)) lot.currentStage = st;
  }
  const pid = sealed.refs.productionId;
  if (pid) {
    const arr = s.byProduction.get(pid) ?? [];
    arr.push(sealed);
    s.byProduction.set(pid, arr);
    // A served meal completes the journey of every lot cooked into it.
    if (sealed.type === 'MEAL_SERVED') for (const c of arr) if (c.type === 'CONSUMED' && c.lotId) { const l = s.lotById.get(c.lotId); if (l) l.currentStage = 'MEAL'; }
  }
}

/** After seeding: order every event by time and build the hash chain once. */
export function sealAll(s: TenantStore) {
  const pending = s.pending.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  s.pending = [];
  s.sealed = true;
  for (const e of pending) appendSealed(s, e);
}

/* ── Exceptions, notifications, audit ── */
const OWNER: Record<string, string> = {
  LOW_STOCK: 'WAREHOUSE_OPERATOR', DELAYED_SHIPMENT: 'TRANSPORT_COORDINATOR', QUANTITY_MISMATCH: 'WAREHOUSE_OPERATOR', QUALITY_FAILURE: 'QUALITY_INSPECTOR',
  EXPIRY_RISK: 'WAREHOUSE_OPERATOR', UNUSUAL_WASTAGE: 'BLOCK_COORDINATOR', MISSING_SCHOOL_REPORT: 'BLOCK_COORDINATOR', MEAL_SHORTFALL: 'BLOCK_COORDINATOR',
  TRACEABILITY_GAP: 'DISTRICT_OFFICER', RECALL_PENDING_ACK: 'DISTRICT_OFFICER',
};

export function raise(s: TenantStore, dedupeKey: string, c: ExceptionCandidate, ctx: { geoPath: string; facility?: FacilityRef; entity?: { kind: 'LOT' | 'SHIPMENT' | 'SCHOOL' | 'FACILITY' | 'RECALL' | 'PRODUCTION'; id: string; label: string }; link?: string }, at = s.now) {
  const existing = s.exceptions.find((e) => e.dedupeKey === dedupeKey);
  if (existing) return existing;
  const row = {
    id: newId(s), exceptionNo: nextNo(s, 'EXC', at), dedupeKey, type: c.type, severity: c.severity, status: 'OPEN' as const, title: c.title, detail: c.detail,
    facility: ctx.facility, geoPath: ctx.geoPath, entity: ctx.entity, owner: { role: OWNER[c.type] ?? 'DISTRICT_OFFICER' }, createdAt: at.toISOString(),
    dueAt: new Date(at.getTime() + c.slaHours * 3_600_000).toISOString(), log: [{ action: 'RAISED', at: at.toISOString(), by: { ...SYSTEM, name: 'Rule engine' } }],
  };
  s.exceptions.push(row);
  if (c.severity === 'HIGH' || c.severity === 'CRITICAL') {
    s.notifications.push({ id: newId(s), title: c.title, body: c.detail, severity: c.severity, link: ctx.link ?? `/exceptions?open=${row.id}`, createdAt: at.toISOString(), geoPath: ctx.geoPath, readBy: [] });
  }
  return row;
}

export function autoResolve(s: TenantStore, dedupeKey: string, note: string, at = new Date()) {
  const e = s.exceptions.find((x) => x.dedupeKey === dedupeKey && x.status !== 'RESOLVED');
  if (!e) return;
  e.status = 'RESOLVED';
  e.log.push({ action: 'AUTO_RESOLVED', note, at: at.toISOString(), by: { ...SYSTEM, name: 'Rule engine' } });
}

export function audit(s: TenantStore, actor: ActorRef, action: string, entity: { kind: string; id: string; label?: string }, changes?: { field: string; from?: unknown; to?: unknown }[], at = new Date()) {
  s.audit.push({ id: newId(s), at: at.toISOString(), actor, service: action.split('.')[0] ?? 'platform', action, entity, changes, ip: '10.12.4.21', requestId: newId(s).slice(-12) });
}
