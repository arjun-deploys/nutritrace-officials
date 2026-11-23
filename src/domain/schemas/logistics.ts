import { z } from 'zod';
import type { ShipmentOrigin, ShipmentStatus, Unit } from '../enums';
import { SHIPMENT_STATUSES } from '../enums';
import type { ActorRef, FacilityRef, Ref } from './common';
import { positiveQty } from './common';

export const shipmentCreateSchema = z
  .object({
    fromFacilityId: z.string().min(1, 'Choose where it ships from'),
    toFacilityId: z.string().min(1, 'Choose the destination'),
    vehicleId: z.string().optional(),
    plannedDispatchAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
    expectedArrivalAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
    purpose: z.enum(['REPLENISHMENT', 'TRANSFER', 'RETURN', 'RECALL_RETURN']).default('REPLENISHMENT'),
    indentId: z.string().optional(),
    lines: z.array(z.object({ lotId: z.string().min(1), quantity: positiveQty })).min(1, 'Add at least one lot'),
  })
  .refine((s) => s.fromFacilityId !== s.toFacilityId, { path: ['toFacilityId'], message: 'Destination must differ from origin' })
  .refine((s) => s.expectedArrivalAt > s.plannedDispatchAt, { path: ['expectedArrivalAt'], message: 'Arrival must be after dispatch' });
export type ShipmentCreateInput = z.infer<typeof shipmentCreateSchema>;

export const milestoneSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  note: z.string().max(300).optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

export const locationPingSchema = z.object({
  pings: z.array(z.object({ lat: z.number(), lng: z.number(), at: z.iso.datetime(), speedKmph: z.number().optional() })).min(1).max(500),
});

export interface ShipmentLineDto {
  lotId: string;
  lotCode: string;
  commodityId: string;
  commodityName: string;
  unit: Unit;
  dispatchedQty: number;
  receivedQty?: number;
  acceptedQty?: number;
  rejectedQty?: number;
}

export interface ShipmentDto {
  id: string;
  tenantId: string;
  shipmentNo: string;
  origin: ShipmentOrigin;
  from: FacilityRef | (Ref & { type: 'SUPPLIER'; geoPath: string });
  to: FacilityRef;
  poId?: string;
  poNumber?: string;
  indentId?: string;
  indentNo?: string;
  tripId?: string;
  tripNo?: string;
  purpose: string;
  status: ShipmentStatus;
  lines: ShipmentLineDto[];
  vehicle?: { registrationNo: string; driverName: string; driverPhone: string; transporterName?: string };
  plannedDispatchAt: string;
  dispatchedAt?: string;
  expectedArrivalAt: string;
  arrivedAt?: string;
  receivedAt?: string;
  delayHours: number;
  hasDiscrepancy: boolean;
  lastLocation?: { lat: number; lng: number; at: string; source: 'GPS' | 'MANUAL' };
  route?: { lat: number; lng: number; at: string }[];
  milestones: { status: ShipmentStatus; at: string; note?: string; actor?: ActorRef }[];
  grnId?: string;
  totalQtyByUnit: Partial<Record<Unit, number>>;
  createdAt: string;
}
