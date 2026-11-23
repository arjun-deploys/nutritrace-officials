/**
 * Integration events published on the `nt.events` topic exchange.
 * Routing key = event name. Consumers must be idempotent on `eventId`.
 */
export const EVENTS = {
  TRACE_RECORD: 'trace.record',
  LOT_CREATED: 'lot.created',
  LOT_STATUS_CHANGED: 'lot.status.changed',
  PO_UPDATED: 'procurement.po.updated',
  ASN_CREATED: 'procurement.asn.created',
  RECEIPT_POSTED: 'inventory.receipt.posted',
  STOCK_CHANGED: 'inventory.stock.changed',
  SHIPMENT_UPDATED: 'logistics.shipment.updated',
  PRODUCTION_RECORDED: 'meals.production.recorded',
  MEAL_SERVICE_REPORTED: 'meals.service.reported',
  INSPECTION_RECORDED: 'quality.inspection.recorded',
  RECALL_UPDATED: 'quality.recall.updated',
  FACILITY_UPSERTED: 'registry.facility.upserted',
  COMMODITY_UPSERTED: 'registry.commodity.upserted',
  AUDIT: 'platform.audit',
} as const;
export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export interface IntegrationEvent<T = unknown> {
  eventId: string;
  name: EventName;
  tenantId: string;
  occurredAt: string;
  source: string;
  requestId?: string;
  payload: T;
}
