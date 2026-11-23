import type { CustodyStage, LotStatus, QuantityKind, TraceEventType, Unit, MealType } from '../enums';
import type { ActorRef, Evidence, FacilityRef, Ref } from './common';

export interface TraceEventDto {
  id: string;
  tenantId: string;
  seq: number;
  type: TraceEventType;
  occurredAt: string;
  recordedAt: string;
  lotId?: string;
  lotCode?: string;
  commodityId?: string;
  quantity: number;
  unit?: Unit;
  quantityKind: QuantityKind;
  from?: FacilityRef | (Ref & { type: 'SUPPLIER'; geoPath: string });
  to?: FacilityRef;
  facility?: FacilityRef;
  refs: {
    poId?: string;
    poNumber?: string;
    shipmentId?: string;
    shipmentNo?: string;
    grnId?: string;
    productionId?: string;
    batchNo?: string;
    mealServiceId?: string;
    inspectionId?: string;
    recallId?: string;
    adjustmentId?: string;
  };
  meals?: { count: number; mealType: MealType; schoolId?: string };
  note?: string;
  actor: ActorRef;
  evidence?: Evidence[];
  geo?: { lat: number; lng: number };
  prevHash: string;
  hash: string;
}

export interface LotDto {
  id: string;
  tenantId: string;
  code: string;
  commodity: Ref & { unit: Unit; category: string };
  supplier: Ref;
  supplierLotNo: string;
  poId: string;
  poNumber: string;
  origin: { district: string; state: string };
  packedOn: string;
  expiresOn: string;
  quantity: number;
  status: LotStatus;
  parentLotId?: string;
  certificateNo?: string;
  currentStage: CustodyStage;
  completeness: number;
  createdAt: string;
}

export interface JourneyStageDto {
  stage: CustodyStage;
  reached: boolean;
  firstAt?: string;
  lastAt?: string;
  facilities: { id: string; name: string; type: string }[];
  quantity: number;
  quantityKind: QuantityKind;
  note?: string;
}

/** The reconciliation every official asks for: where did each kilogram go? */
export interface LotFlowDto {
  procured: number;
  dispatchedBySupplier: number;
  receivedAtFirstWarehouse: number;
  accepted: number;
  rejected: number;
  inTransit: number;
  onHand: number;
  consumed: number;
  wasted: number;
  adjusted: number;
  unaccounted: number;
  mealsServed: number;
  schoolsReached: number;
  facilitiesReached: number;
}

export interface CompletenessDto {
  score: number;
  checks: { key: string; label: string; passed: boolean; detail?: string }[];
}

export interface LotJourneyDto {
  lot: LotDto;
  stages: JourneyStageDto[];
  flow: LotFlowDto;
  completeness: CompletenessDto;
  events: TraceEventDto[];
  integrity: { verified: boolean; eventsChecked: number; brokenAt?: number };
}

export type TraceNodeKind = 'SUPPLIER' | 'LOT' | 'FACILITY' | 'SHIPMENT' | 'PRODUCTION' | 'SCHOOL_MEALS';
export interface TraceNodeDto {
  id: string;
  kind: TraceNodeKind;
  label: string;
  sublabel?: string;
  stage: CustodyStage;
  quantity?: number;
  unit?: Unit;
  meals?: number;
  at?: string;
  status?: string;
  flagged?: boolean;
  depth: number;
}
export interface TraceEdgeDto {
  from: string;
  to: string;
  label: string;
  quantity?: number;
  unit?: Unit;
  at?: string;
}
export interface TraceGraphDto {
  rootId: string;
  direction: 'forward' | 'backward';
  nodes: TraceNodeDto[];
  edges: TraceEdgeDto[];
  summary: { facilities: number; schools: number; meals: number; lots: number; suppliers: number };
}

export interface LedgerVerificationDto {
  verified: boolean;
  eventsChecked: number;
  firstSeq: number;
  lastSeq: number;
  headHash: string;
  brokenAtSeq?: number;
  checkedAt: string;
}
