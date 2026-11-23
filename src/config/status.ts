import type { BadgeTone } from '@/components/ui/badge';

/**
 * One registry for every status the platform shows. Pages never choose
 * colours or wording for a status themselves.
 */
type Entry = { label: string; tone: BadgeTone };
const reg: Record<string, Record<string, Entry>> = {
  lot: {
    PENDING_QC: { label: 'Awaiting QC', tone: 'warning' },
    RELEASED: { label: 'Released', tone: 'success' },
    ON_HOLD: { label: 'On hold', tone: 'danger' },
    REJECTED: { label: 'Rejected', tone: 'danger' },
    RECALLED: { label: 'Recalled', tone: 'danger' },
    DEPLETED: { label: 'Fully used', tone: 'neutral' },
    DISPOSED: { label: 'Disposed', tone: 'neutral' },
  },
  shipment: {
    PLANNED: { label: 'Planned', tone: 'neutral' },
    DISPATCHED: { label: 'Dispatched', tone: 'info' },
    IN_TRANSIT: { label: 'In transit', tone: 'info' },
    DELAYED: { label: 'Delayed', tone: 'danger' },
    ARRIVED: { label: 'Arrived', tone: 'info' },
    RECEIVED: { label: 'Received', tone: 'success' },
    PARTIALLY_RECEIVED: { label: 'Received with discrepancy', tone: 'warning' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  },
  po: {
    DRAFT: { label: 'Draft', tone: 'neutral' },
    PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'warning' },
    APPROVED: { label: 'Approved', tone: 'info' },
    PARTIALLY_FULFILLED: { label: 'Partly delivered', tone: 'info' },
    FULFILLED: { label: 'Delivered', tone: 'success' },
    CLOSED: { label: 'Closed', tone: 'neutral' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  },
  severity: {
    LOW: { label: 'Low', tone: 'neutral' },
    MEDIUM: { label: 'Medium', tone: 'warning' },
    HIGH: { label: 'High', tone: 'danger' },
    CRITICAL: { label: 'Critical', tone: 'danger' },
  },
  exception: {
    OPEN: { label: 'Open', tone: 'danger' },
    ACKNOWLEDGED: { label: 'Acknowledged', tone: 'warning' },
    RESOLVED: { label: 'Resolved', tone: 'success' },
  },
  approval: {
    PENDING: { label: 'Awaiting approval', tone: 'warning' },
    APPROVED: { label: 'Approved', tone: 'success' },
    REJECTED: { label: 'Rejected', tone: 'neutral' },
  },
  inspection: {
    PENDING: { label: 'Pending', tone: 'neutral' },
    PASS: { label: 'Pass', tone: 'success' },
    FAIL: { label: 'Fail', tone: 'danger' },
    CONDITIONAL: { label: 'Conditional', tone: 'warning' },
  },
  recall: {
    INITIATED: { label: 'Initiated', tone: 'danger' },
    IN_PROGRESS: { label: 'In progress', tone: 'warning' },
    CLOSED: { label: 'Closed', tone: 'success' },
  },
  capa: {
    OPEN: { label: 'Open', tone: 'danger' },
    IN_PROGRESS: { label: 'In progress', tone: 'warning' },
    PENDING_VERIFICATION: { label: 'Awaiting verification', tone: 'info' },
    CLOSED: { label: 'Closed', tone: 'success' },
  },
  service: {
    REPORTED: { label: 'Reported', tone: 'success' },
    PENDING: { label: 'Not reported', tone: 'warning' },
    INTERRUPTED: { label: 'Interrupted', tone: 'danger' },
  },
  supplier: {
    APPROVED: { label: 'Approved', tone: 'success' },
    PENDING_VERIFICATION: { label: 'Pending verification', tone: 'warning' },
    SUSPENDED: { label: 'Suspended', tone: 'danger' },
  },
  user: {
    ACTIVE: { label: 'Active', tone: 'success' },
    SUSPENDED: { label: 'Suspended', tone: 'danger' },
    INVITED: { label: 'Invited', tone: 'info' },
  },
  indent: {
    SUBMITTED: { label: 'Awaiting approval', tone: 'warning' },
    APPROVED: { label: 'Approved — to ship', tone: 'info' },
    PARTIALLY_FULFILLED: { label: 'Partly shipped', tone: 'info' },
    FULFILLED: { label: 'Shipped', tone: 'success' },
    REJECTED: { label: 'Rejected', tone: 'danger' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  },
  trip: {
    PLANNED: { label: 'Planned', tone: 'neutral' },
    IN_PROGRESS: { label: 'On the road', tone: 'info' },
    COMPLETED: { label: 'Completed', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  },
  stop: {
    PENDING: { label: 'Not yet reached', tone: 'neutral' },
    ARRIVED: { label: 'At the school', tone: 'info' },
    DELIVERED: { label: 'Delivered', tone: 'success' },
    FAILED: { label: 'Failed', tone: 'danger' },
  },
  recipe: {
    APPROVED: { label: 'Approved', tone: 'success' },
    DRAFT: { label: 'Draft', tone: 'warning' },
    RETIRED: { label: 'Retired', tone: 'neutral' },
  },
};
export type StatusKind = keyof typeof reg;
export function statusOf(kind: StatusKind, value?: string | null): Entry {
  if (!value) return { label: '—', tone: 'neutral' };
  return reg[kind]?.[value] ?? { label: value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' '), tone: 'neutral' };
}

export const EXCEPTION_LABEL: Record<string, string> = {
  LOW_STOCK: 'Low stock', DELAYED_SHIPMENT: 'Delayed shipment', QUANTITY_MISMATCH: 'Quantity mismatch', QUALITY_FAILURE: 'Quality failure',
  EXPIRY_RISK: 'Expiry risk', UNUSUAL_WASTAGE: 'Unusual wastage', MISSING_SCHOOL_REPORT: 'Missing school report', MEAL_SHORTFALL: 'Children not fed',
  TRACEABILITY_GAP: 'Traceability gap', RECALL_PENDING_ACK: 'Recall not acknowledged',
};

export const MEAL_LABEL: Record<string, string> = { BREAKFAST: 'Breakfast', LUNCH: 'Lunch', SNACK: 'Snack' };
