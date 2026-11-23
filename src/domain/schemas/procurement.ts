import { z } from 'zod';
import type { PoStatus, Unit } from '../enums';
import type { ActorRef, FacilityRef, Ref } from './common';
import { positiveQty } from './common';

export const poCreateSchema = z.object({
  supplierId: z.string().min(1, 'Choose a supplier'),
  deliverToFacilityId: z.string().min(1, 'Choose the receiving warehouse'),
  programmeCode: z.string().min(2, 'Choose a programme'),
  contractRef: z.string().trim().max(60).optional(),
  expectedDeliveryDate: z.iso.date({ error: 'Choose a delivery date' }),
  notes: z.string().max(500).optional(),
  lines: z
    .array(z.object({ commodityId: z.string().min(1, 'Choose a commodity'), quantity: positiveQty, ratePerUnit: z.coerce.number().min(0).optional() }))
    .min(1, 'Add at least one commodity'),
});
export type PoCreateInput = z.infer<typeof poCreateSchema>;

export const poDecisionSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT']), comment: z.string().max(500).optional() });

export interface PoLineDto {
  commodityId: string;
  commodityName: string;
  unit: Unit;
  quantity: number;
  ratePerUnit?: number;
  /** Fulfilment ledger — kept separate per the measurement rule. */
  dispatched: number;
  received: number;
  accepted: number;
  rejected: number;
}

export interface PoDto {
  id: string;
  tenantId: string;
  poNumber: string;
  supplier: Ref;
  deliverTo: FacilityRef;
  programmeCode: string;
  contractRef?: string;
  expectedDeliveryDate: string;
  status: PoStatus;
  lines: PoLineDto[];
  notes?: string;
  history: { status: PoStatus; at: string; actor: ActorRef; comment?: string }[];
  createdAt: string;
  createdBy: ActorRef;
}

/** Advance shipping notice from a supplier — this is where lots are born. */
export const asnCreateSchema = z.object({
  poId: z.string().min(1),
  vehicleNo: z.string().trim().toUpperCase().min(6, 'Enter the vehicle number'),
  driverName: z.string().trim().min(2),
  driverPhone: z.string().trim().min(10),
  dispatchedAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
  expectedArrivalAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
  invoiceNo: z.string().trim().min(2),
  lots: z
    .array(
      z.object({
        commodityId: z.string().min(1),
        supplierLotNo: z.string().trim().min(2, 'Enter the supplier lot number'),
        quantity: positiveQty,
        packedOn: z.iso.date(),
        expiresOn: z.iso.date(),
        originDistrict: z.string().trim().min(2),
        originState: z.string().trim().min(2),
        certificateNo: z.string().trim().optional(),
      }).refine((l) => l.expiresOn > l.packedOn, { path: ['expiresOn'], message: 'Expiry must be after packing date' }),
    )
    .min(1),
});
export type AsnCreateInput = z.infer<typeof asnCreateSchema>;
