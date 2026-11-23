/**
 * Canonical vocabularies shared by every service and both frontends.
 * Changing a value here is a contract change — version the API if you do.
 */

export const FACILITY_TYPES = [
  'STATE_WAREHOUSE',
  'DISTRICT_WAREHOUSE',
  'BLOCK_STORE',
  'CENTRAL_KITCHEN',
  'SCHOOL',
] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

/** Custody stages drawn on the custody ribbon, in order of travel. */
export const CUSTODY_STAGES = ['SOURCE', 'WAREHOUSE', 'DISTRIBUTION', 'KITCHEN', 'SCHOOL', 'MEAL'] as const;
export type CustodyStage = (typeof CUSTODY_STAGES)[number];

export const FACILITY_STAGE: Record<FacilityType, CustodyStage> = {
  STATE_WAREHOUSE: 'WAREHOUSE',
  DISTRICT_WAREHOUSE: 'DISTRIBUTION',
  BLOCK_STORE: 'DISTRIBUTION',
  CENTRAL_KITCHEN: 'KITCHEN',
  SCHOOL: 'SCHOOL',
};

export const LOT_STATUSES = ['PENDING_QC', 'RELEASED', 'ON_HOLD', 'REJECTED', 'RECALLED', 'DEPLETED', 'DISPOSED'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];
/** Stock in these states must never be issued or dispatched. */
export const BLOCKED_LOT_STATUSES: readonly LotStatus[] = ['PENDING_QC', 'ON_HOLD', 'REJECTED', 'RECALLED', 'DISPOSED'];

export const UNITS = ['KG', 'LITRE', 'PIECE', 'PACKET'] as const;
export type Unit = (typeof UNITS)[number];

export const COMMODITY_CATEGORIES = ['CEREAL', 'MILLET', 'PULSE', 'EGG', 'OIL', 'VEGETABLE', 'CONDIMENT', 'MILK', 'OTHER'] as const;
export type CommodityCategory = (typeof COMMODITY_CATEGORIES)[number];

/**
 * Measurement rule from the blueprint: dispatch ≠ receipt ≠ issue ≠ consumption ≠ served.
 * Every trace event carries exactly one quantity kind; they are never inferred from each other.
 */
export const QUANTITY_KINDS = [
  'PROCURED', 'DISPATCHED', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'ISSUED', 'CONSUMED', 'WASTED', 'ADJUSTED', 'SERVED', 'NONE',
] as const;
export type QuantityKind = (typeof QUANTITY_KINDS)[number];

export const TRACE_EVENT_TYPES = [
  'LOT_CREATED',
  'DISPATCHED',
  'RECEIVED',
  'INSPECTED',
  'STATUS_CHANGED',
  'ADJUSTED',
  'CONSUMED',
  'MEAL_PRODUCED',
  'MEAL_SERVED',
  'WASTAGE_RECORDED',
  'RECALL_INITIATED',
  'RECALL_ACKNOWLEDGED',
  'RECALL_CLOSED',
] as const;
export type TraceEventType = (typeof TRACE_EVENT_TYPES)[number];

export const PO_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CLOSED', 'CANCELLED'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const SHIPMENT_STATUSES = [
  'PLANNED', 'DISPATCHED', 'IN_TRANSIT', 'DELAYED', 'ARRIVED', 'RECEIVED', 'PARTIALLY_RECEIVED', 'CANCELLED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export const OPEN_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ['PLANNED', 'DISPATCHED', 'IN_TRANSIT', 'DELAYED', 'ARRIVED'];

export const SHIPMENT_ORIGINS = ['SUPPLIER', 'FACILITY'] as const;
export type ShipmentOrigin = (typeof SHIPMENT_ORIGINS)[number];

export const LEDGER_TXN_TYPES = ['RECEIPT', 'DISPATCH', 'ISSUE', 'ADJUSTMENT', 'RESERVATION', 'RELEASE_RESERVATION', 'DISPOSAL'] as const;
export type LedgerTxnType = (typeof LEDGER_TXN_TYPES)[number];

export const REJECTION_REASONS = ['DAMAGED', 'SHORT_SUPPLIED', 'QUALITY_FAILURE', 'EXPIRED', 'PEST_INFESTATION', 'MOISTURE', 'WRONG_ITEM', 'OTHER'] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const ADJUSTMENT_REASONS = ['CYCLE_COUNT', 'DAMAGE', 'PEST', 'SPILLAGE', 'EXPIRY', 'THEFT', 'DATA_CORRECTION'] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'SNACK'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const SCHOOL_CATEGORIES = ['PRIMARY', 'UPPER_PRIMARY'] as const;
export type SchoolCategory = (typeof SCHOOL_CATEGORIES)[number];

export const WASTAGE_REASONS = ['LEFTOVER_PLATE', 'LEFTOVER_POT', 'SPOILED', 'BURNT', 'LOW_ATTENDANCE', 'OTHER'] as const;
export type WastageReason = (typeof WASTAGE_REASONS)[number];

export const INSPECTION_TYPES = ['RECEIPT', 'STORAGE', 'KITCHEN_HYGIENE', 'LAB_TEST', 'COMPLAINT'] as const;
export type InspectionType = (typeof INSPECTION_TYPES)[number];

export const INSPECTION_RESULTS = ['PENDING', 'PASS', 'FAIL', 'CONDITIONAL'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const QUALITY_DECISIONS = ['RELEASE', 'HOLD', 'REJECT'] as const;
export type QualityDecision = (typeof QUALITY_DECISIONS)[number];

export const CAPA_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'CLOSED'] as const;
export type CapaStatus = (typeof CAPA_STATUSES)[number];

export const RECALL_STATUSES = ['INITIATED', 'IN_PROGRESS', 'CLOSED'] as const;
export type RecallStatus = (typeof RECALL_STATUSES)[number];

export const EXCEPTION_TYPES = [
  'LOW_STOCK',
  'DELAYED_SHIPMENT',
  'QUANTITY_MISMATCH',
  'QUALITY_FAILURE',
  'EXPIRY_RISK',
  'UNUSUAL_WASTAGE',
  'MISSING_SCHOOL_REPORT',
  'MEAL_SHORTFALL',
  'TRACEABILITY_GAP',
  'RECALL_PENDING_ACK',
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const EXCEPTION_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'INVITED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
