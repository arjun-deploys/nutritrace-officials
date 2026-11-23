import { CUSTODY_STAGES, FACILITY_STAGE, type CustodyStage, type FacilityType } from '../enums';
import type {
  CompletenessDto, JourneyStageDto, LotDto, LotFlowDto, TraceEdgeDto, TraceEventDto, TraceGraphDto, TraceNodeDto,
} from '../schemas/trace';
import { round } from './fefo';

type AnyParty = NonNullable<TraceEventDto['from']>;
const isSupplier = (p?: AnyParty) => !!p && p.type === 'SUPPLIER';
const facilityType = (p?: AnyParty) => (p && p.type !== 'SUPPLIER' ? (p.type as FacilityType) : undefined);

/** Stage reached by an event, following the custody ribbon order. */
export function stageOfEvent(e: TraceEventDto): CustodyStage | undefined {
  switch (e.type) {
    case 'LOT_CREATED':
      return 'SOURCE';
    case 'RECEIVED': {
      const t = facilityType(e.to);
      if (!t) return undefined;
      if (t === 'CENTRAL_KITCHEN') return 'KITCHEN';
      return FACILITY_STAGE[t];
    }
    case 'CONSUMED':
    case 'MEAL_PRODUCED':
      return 'KITCHEN';
    case 'MEAL_SERVED':
      return 'MEAL';
    default:
      return undefined;
  }
}

export function currentStage(events: readonly TraceEventDto[]): CustodyStage {
  let max = 0;
  for (const e of events) {
    const s = stageOfEvent(e);
    if (s) max = Math.max(max, CUSTODY_STAGES.indexOf(s));
  }
  return CUSTODY_STAGES[max]!;
}

/**
 * Mass balance for one lot. `lotEvents` are events carrying this lotId;
 * `servedEvents` are MEAL_SERVED events of production batches that consumed the lot.
 */
export function computeFlow(lotEvents: readonly TraceEventDto[], servedEvents: readonly TraceEventDto[] = []): LotFlowDto {
  const sum = (pred: (e: TraceEventDto) => boolean) => round(lotEvents.filter(pred).reduce((a, e) => a + e.quantity, 0));
  const procured = sum((e) => e.type === 'LOT_CREATED');
  const dispatchedBySupplier = sum((e) => e.type === 'DISPATCHED' && isSupplier(e.from));
  const receivedAtFirstWarehouse = sum((e) => e.type === 'RECEIVED' && e.quantityKind === 'RECEIVED' && isSupplier(e.from));
  const accepted = sum((e) => e.type === 'RECEIVED' && e.quantityKind === 'ACCEPTED' && isSupplier(e.from));
  const rejected = sum((e) => e.type === 'RECEIVED' && e.quantityKind === 'REJECTED');
  const consumed = sum((e) => e.type === 'CONSUMED');
  const wasted = sum((e) => e.type === 'WASTAGE_RECORDED');
  const adjusted = sum((e) => e.type === 'ADJUSTED');

  // Per-facility balances and per-shipment transit
  const balance = new Map<string, number>();
  const add = (id: string | undefined, q: number) => id && balance.set(id, (balance.get(id) ?? 0) + q);
  const shipments = new Map<string, { dispatched: number; received: number; closed: boolean }>();
  for (const e of lotEvents) {
    const sid = e.refs.shipmentId;
    if (e.type === 'RECEIVED' && e.quantityKind === 'ACCEPTED') add(e.to?.id, e.quantity);
    if (e.type === 'DISPATCHED' && !isSupplier(e.from)) add(e.from?.id, -e.quantity);
    if (e.type === 'CONSUMED' || e.type === 'WASTAGE_RECORDED') add(e.facility?.id, -e.quantity);
    if (e.type === 'ADJUSTED') add(e.facility?.id, e.quantity);
    if (sid && e.type === 'DISPATCHED') {
      const s = shipments.get(sid) ?? { dispatched: 0, received: 0, closed: false };
      s.dispatched += e.quantity;
      shipments.set(sid, s);
    }
    if (sid && e.type === 'RECEIVED' && e.quantityKind === 'RECEIVED') {
      const s = shipments.get(sid) ?? { dispatched: 0, received: 0, closed: false };
      s.received += e.quantity;
      s.closed = true;
      shipments.set(sid, s);
    }
  }
  let inTransit = 0;
  let transitShort = 0;
  for (const s of shipments.values()) {
    if (s.closed) transitShort += Math.max(0, s.dispatched - s.received);
    else inTransit += s.dispatched;
  }
  const onHand = round([...balance.values()].reduce((a, v) => a + Math.max(0, v), 0));
  const writeOffs = Math.max(0, -adjusted);
  const start = dispatchedBySupplier || procured;
  const unaccounted = round(Math.max(0, start - rejected - consumed - wasted - writeOffs - onHand - inTransit));
  const schools = new Set<string>();
  const facilities = new Set<string>();
  for (const e of lotEvents) {
    if (e.type === 'RECEIVED' && e.to) {
      facilities.add(e.to.id);
      if (e.to.type === 'SCHOOL') schools.add(e.to.id);
    }
  }
  let mealsServed = 0;
  for (const e of servedEvents) {
    mealsServed += e.meals?.count ?? 0;
    if (e.facility?.id) schools.add(e.facility.id);
  }
  void transitShort;
  return {
    procured, dispatchedBySupplier, receivedAtFirstWarehouse, accepted, rejected, inTransit: round(inTransit), onHand,
    consumed, wasted, adjusted, unaccounted, mealsServed, schoolsReached: schools.size, facilitiesReached: facilities.size,
  };
}

export function buildStages(lotEvents: readonly TraceEventDto[], servedEvents: readonly TraceEventDto[] = []): JourneyStageDto[] {
  const all = [...lotEvents, ...servedEvents];
  return CUSTODY_STAGES.map((stage) => {
    const evs = all.filter((e) => stageOfEvent(e) === stage && (e.type !== 'RECEIVED' || e.quantityKind === 'ACCEPTED'));
    const facilities = new Map<string, { id: string; name: string; type: string }>();
    for (const e of evs) {
      const p = stage === 'SOURCE' ? e.from : e.type === 'RECEIVED' ? e.to : e.facility;
      if (p) facilities.set(p.id, { id: p.id, name: p.name, type: p.type });
    }
    const times = evs.map((e) => e.occurredAt).sort();
    const quantity = stage === 'MEAL' ? evs.reduce((a, e) => a + (e.meals?.count ?? 0), 0) : evs.filter((e) => e.type !== 'MEAL_PRODUCED').reduce((a, e) => a + e.quantity, 0);
    return {
      stage,
      reached: evs.length > 0,
      firstAt: times[0],
      lastAt: times[times.length - 1],
      facilities: [...facilities.values()],
      quantity: round(quantity),
      quantityKind: stage === 'SOURCE' ? 'PROCURED' : stage === 'KITCHEN' ? 'CONSUMED' : stage === 'MEAL' ? 'SERVED' : 'ACCEPTED',
    } satisfies JourneyStageDto;
  });
}

export function computeCompleteness(
  lot: Pick<LotDto, 'supplierLotNo' | 'certificateNo' | 'poId' | 'status'>,
  lotEvents: readonly TraceEventDto[],
  servedEvents: readonly TraceEventDto[] = [],
  opts: { now?: Date; transitGraceHours?: number; integrityOk?: boolean } = {},
): CompletenessDto {
  const now = opts.now ?? new Date();
  const grace = (opts.transitGraceHours ?? 48) * 3_600_000;
  const has = (t: TraceEventDto['type']) => lotEvents.some((e) => e.type === t);
  const dispatches = lotEvents.filter((e) => e.type === 'DISPATCHED');
  const receivedShipments = new Set(lotEvents.filter((e) => e.type === 'RECEIVED').map((e) => e.refs.shipmentId));
  const openTooLong = dispatches.filter((d) => !receivedShipments.has(d.refs.shipmentId) && now.getTime() - new Date(d.occurredAt).getTime() > grace);
  const consumptions = lotEvents.filter((e) => e.type === 'CONSUMED');
  const unlinked = consumptions.filter((c) => !c.refs.productionId);
  const servedBatches = new Set(servedEvents.map((e) => e.refs.productionId));
  const consumedBatches = new Set(consumptions.map((c) => c.refs.productionId).filter(Boolean));
  const unserved = [...consumedBatches].filter((b) => !servedBatches.has(b));
  const checks = [
    { key: 'source', label: 'Supplier lot number and certificate captured', passed: !!lot.supplierLotNo && !!lot.certificateNo },
    { key: 'po', label: 'Linked to an approved purchase order', passed: !!lot.poId },
    { key: 'dispatch', label: 'Supplier dispatch recorded', passed: dispatches.some((d) => isSupplier(d.from)) },
    { key: 'grn', label: 'Goods receipt recorded at first warehouse', passed: lotEvents.some((e) => e.type === 'RECEIVED' && isSupplier(e.from)) },
    { key: 'qc', label: 'Quality inspection on record', passed: has('INSPECTED') },
    {
      key: 'transit',
      label: 'Every dispatch has a confirmed receipt',
      passed: openTooLong.length === 0,
      detail: openTooLong.length ? `${openTooLong.length} shipment(s) unconfirmed beyond grace period` : undefined,
    },
    {
      key: 'production',
      label: 'Every kitchen issue is linked to a meal batch',
      passed: unlinked.length === 0,
      detail: unlinked.length ? `${unlinked.length} issue(s) without a production batch` : undefined,
    },
    {
      key: 'service',
      label: 'Every meal batch has a school service record',
      passed: unserved.length === 0,
      detail: unserved.length ? `${unserved.length} batch(es) without a service record` : undefined,
    },
    { key: 'integrity', label: 'Ledger hash chain verified', passed: opts.integrityOk ?? true },
  ];
  const score = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
  return { score, checks };
}

/**
 * Aggregated custody graph. Nodes are de-duplicated per facility so a lot that
 * touched 70 schools draws 70 school nodes, not 1,000 transaction nodes.
 */
export function buildTraceGraph(params: {
  rootId: string;
  direction: 'forward' | 'backward';
  events: readonly TraceEventDto[];
  lots: readonly Pick<LotDto, 'id' | 'code' | 'status' | 'quantity' | 'commodity'>[];
}): TraceGraphDto {
  const nodes = new Map<string, TraceNodeDto>();
  const edges = new Map<string, TraceEdgeDto>();
  const lotById = new Map(params.lots.map((l) => [l.id, l]));
  const addNode = (n: Omit<TraceNodeDto, 'depth'>) => {
    const existing = nodes.get(n.id);
    if (existing) {
      if (n.quantity) existing.quantity = round((existing.quantity ?? 0) + n.quantity);
      if (n.meals) existing.meals = (existing.meals ?? 0) + n.meals;
      return;
    }
    nodes.set(n.id, { ...n, depth: -1 });
  };
  const addEdge = (from: string, to: string, label: string, quantity?: number, unit?: TraceEdgeDto['unit'], at?: string) => {
    const key = `${from}>${to}>${label}`;
    const e = edges.get(key);
    if (e) {
      e.quantity = round((e.quantity ?? 0) + (quantity ?? 0));
      if (at && (!e.at || at > e.at)) e.at = at;
    } else edges.set(key, { from, to, label, quantity, unit, at });
  };
  const facNode = (p: AnyParty, stage: CustodyStage): string => {
    const id = p.type === 'SUPPLIER' ? `S:${p.id}` : `F:${p.id}`;
    addNode({ id, kind: p.type === 'SUPPLIER' ? 'SUPPLIER' : 'FACILITY', label: p.name, sublabel: p.type.replaceAll('_', ' ').toLowerCase(), stage });
    return id;
  };

  for (const l of params.lots) {
    addNode({ id: `L:${l.id}`, kind: 'LOT', label: l.code, sublabel: l.commodity.name, stage: 'SOURCE', quantity: l.quantity, unit: l.commodity.unit, status: l.status, flagged: l.status === 'RECALLED' || l.status === 'ON_HOLD' });
  }
  for (const e of params.events) {
    const unit = e.unit;
    if (e.type === 'LOT_CREATED' && e.from && e.lotId) {
      addEdge(facNode(e.from, 'SOURCE'), `L:${e.lotId}`, 'supplied', e.quantity, unit, e.occurredAt);
    } else if (e.type === 'RECEIVED' && e.quantityKind === 'ACCEPTED' && e.to && e.from) {
      const to = facNode(e.to, stageOfEvent(e) ?? 'WAREHOUSE');
      const from = e.from.type === 'SUPPLIER' && e.lotId ? `L:${e.lotId}` : facNode(e.from, 'WAREHOUSE');
      addEdge(from, to, 'received', e.quantity, unit, e.occurredAt);
    } else if (e.type === 'CONSUMED' && e.facility && e.refs.productionId) {
      const fac = facNode(e.facility, e.facility.type === 'SCHOOL' ? 'SCHOOL' : 'KITCHEN');
      const pid = `P:${e.facility.id}`;
      addNode({ id: pid, kind: 'PRODUCTION', label: e.facility.name, sublabel: 'kitchen', stage: 'KITCHEN', quantity: e.quantity, unit });
      addEdge(fac, pid, 'issued to kitchen', e.quantity, unit, e.occurredAt);
    } else if (e.type === 'MEAL_SERVED' && e.facility) {
      const producerId = e.refs.productionId ? productionFacility(params.events, e.refs.productionId) : undefined;
      const pid = `P:${producerId ?? e.facility.id}`;
      const mid = `M:${e.facility.id}`;
      addNode({ id: mid, kind: 'SCHOOL_MEALS', label: e.facility.name, sublabel: 'meals served', stage: 'MEAL', meals: e.meals?.count ?? 0, at: e.occurredAt });
      if (nodes.has(pid)) addEdge(pid, mid, 'served', e.meals?.count, undefined, e.occurredAt);
    }
  }
  // Depth via BFS from root in the requested direction
  const adj = new Map<string, string[]>();
  for (const e of edges.values()) {
    const [a, b] = params.direction === 'forward' ? [e.from, e.to] : [e.to, e.from];
    adj.set(a, [...(adj.get(a) ?? []), b]);
  }
  const queue: string[] = [params.rootId];
  const root = nodes.get(params.rootId);
  if (root) root.depth = 0;
  while (queue.length) {
    const id = queue.shift()!;
    const d = nodes.get(id)!.depth;
    for (const nxt of adj.get(id) ?? []) {
      const n = nodes.get(nxt);
      if (n && n.depth === -1) {
        n.depth = d + 1;
        queue.push(nxt);
      }
    }
  }
  // Always show where the root itself came from (e.g. the supplier of a lot in a forward trace).
  for (const e of edges.values()) {
    const upstream = params.direction === 'forward' ? (e.to === params.rootId ? e.from : undefined) : e.from === params.rootId ? e.to : undefined;
    const n = upstream ? nodes.get(upstream) : undefined;
    if (n && n.depth === -1) n.depth = 0;
  }
  const reachable = [...nodes.values()].filter((n) => n.depth >= 0);
  const ids = new Set(reachable.map((n) => n.id));
  const keptEdges = [...edges.values()].filter((e) => ids.has(e.from) && ids.has(e.to));
  const mealsNodes = reachable.filter((n) => n.kind === 'SCHOOL_MEALS');
  void lotById;
  return {
    rootId: params.rootId,
    direction: params.direction,
    nodes: reachable.sort((a, b) => a.depth - b.depth || a.label.localeCompare(b.label)),
    edges: keptEdges,
    summary: {
      facilities: reachable.filter((n) => n.kind === 'FACILITY').length,
      schools: mealsNodes.length,
      meals: mealsNodes.reduce((a, n) => a + (n.meals ?? 0), 0),
      lots: reachable.filter((n) => n.kind === 'LOT').length,
      suppliers: reachable.filter((n) => n.kind === 'SUPPLIER').length,
    },
  };
}

function productionFacility(events: readonly TraceEventDto[], productionId: string): string | undefined {
  return events.find((e) => e.type === 'CONSUMED' && e.refs.productionId === productionId)?.facility?.id;
}
