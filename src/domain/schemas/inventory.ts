import { z } from 'zod';
import { ADJUSTMENT_REASONS, REJECTION_REASONS, type AdjustmentReason, type ApprovalStatus, type LedgerTxnType, type LotStatus, type Unit } from '../enums';
import type { ActorRef, FacilityRef } from './common';
import { evidenceSchema, nonNegativeQty } from './common';

export interface LotRef {
  id: string;
  code: string;
  commodityId: string;
  commodityName: string;
  unit: Unit;
  expiresOn: string;
  status: LotStatus;
}

export interface StockRowDto {
  id: string;
  facility: FacilityRef;
  lot: LotRef;
  onHand: number;
  reserved: number;
  available: number;
  receivedAt: string;
  lastMovementAt: string;
}

export interface StockSummaryDto {
  commodityId: string;
  commodityName: string;
  unit: Unit;
  onHand: number;
  available: number;
  onHold: number;
  nearExpiry: number;
  lots: number;
  facilities: number;
  avgDailyConsumption: number;
  daysOfCover: number | null;
}

export const grnLineSchema = z
  .object({
    lotId: z.string().min(1),
    expectedQty: nonNegativeQty,
    receivedQty: nonNegativeQty,
    acceptedQty: nonNegativeQty,
    rejectedQty: nonNegativeQty,
    rejectionReason: z.enum(REJECTION_REASONS).optional(),
  })
  .refine((l) => Math.abs(l.acceptedQty + l.rejectedQty - l.receivedQty) < 1e-6, {
    path: ['acceptedQty'],
    message: 'Accepted + rejected must equal received',
  })
  .refine((l) => l.rejectedQty === 0 || !!l.rejectionReason, { path: ['rejectionReason'], message: 'Give a reason for the rejected quantity' });

export const grnCreateSchema = z.object({
  facilityId: z.string().min(1),
  shipmentId: z.string().min(1),
  receivedAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
  sealIntact: z.boolean(),
  remarks: z.string().max(500).optional(),
  evidence: z.array(evidenceSchema).max(10).default([]),
  geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  lines: z.array(grnLineSchema).min(1),
});
export type GrnCreateInput = z.infer<typeof grnCreateSchema>;

export interface GrnDto {
  id: string;
  grnNo: string;
  facility: FacilityRef;
  shipmentId: string;
  shipmentNo: string;
  receivedAt: string;
  sealIntact: boolean;
  remarks?: string;
  hasDiscrepancy: boolean;
  lines: (z.infer<typeof grnLineSchema> & { lotCode: string; commodityName: string; unit: Unit })[];
  receivedBy: ActorRef;
}

export const adjustmentCreateSchema = z.object({
  facilityId: z.string().min(1),
  lotId: z.string().min(1, 'Choose a lot'),
  quantityDelta: z.coerce.number().refine((v) => v !== 0, 'Enter a non-zero change'),
  reason: z.enum(ADJUSTMENT_REASONS),
  remarks: z.string().trim().min(5, 'Explain the adjustment').max(500),
});
export type AdjustmentCreateInput = z.infer<typeof adjustmentCreateSchema>;

export interface AdjustmentDto {
  id: string;
  adjNo: string;
  facility: FacilityRef;
  lot: LotRef;
  quantityDelta: number;
  reason: AdjustmentReason;
  remarks: string;
  status: ApprovalStatus;
  requestedBy: ActorRef;
  requestedAt: string;
  decidedBy?: ActorRef;
  decidedAt?: string;
  decisionComment?: string;
}

export interface LedgerEntryDto {
  id: string;
  facilityId: string;
  lotId: string;
  lotCode: string;
  commodityName: string;
  unit: Unit;
  type: LedgerTxnType;
  quantity: number;
  balanceAfter: number;
  ref: { kind: string; id: string; label: string };
  at: string;
  actor: ActorRef;
}

export interface FefoPick {
  lotId: string;
  lotCode: string;
  expiresOn: string;
  quantity: number;
}
