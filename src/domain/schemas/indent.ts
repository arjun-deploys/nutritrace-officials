import { z } from 'zod';
import type { Unit } from '../enums';
import type { ActorRef, FacilityRef } from './common';
import { positiveQty } from './common';

/** StaTwig pull model: a facility asks the level above for stock; the level above fulfils it with a shipment. */
export const INDENT_STATUSES = ['SUBMITTED', 'APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'REJECTED', 'CANCELLED'] as const;
export type IndentStatus = (typeof INDENT_STATUSES)[number];
export const OPEN_INDENT_STATUSES: readonly IndentStatus[] = ['SUBMITTED', 'APPROVED', 'PARTIALLY_FULFILLED'];

export const indentCreateSchema = z.object({
  requestingFacilityId: z.string().min(1, 'Choose who needs the stock'),
  supplyingFacilityId: z.string().min(1, 'Choose who supplies it'),
  neededBy: z.iso.date({ error: 'Choose the date it is needed by' }),
  reason: z.enum(['ROUTINE', 'SHORTFALL', 'RECALL_REPLACEMENT', 'ENROLMENT_INCREASE', 'OTHER']).default('ROUTINE'),
  notes: z.string().max(500).optional(),
  lines: z.array(z.object({ commodityId: z.string().min(1, 'Choose a product'), quantity: positiveQty })).min(1, 'Add at least one product'),
});
export type IndentCreateInput = z.infer<typeof indentCreateSchema>;

export const indentDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().max(500).optional(),
  approved: z.array(z.object({ commodityId: z.string(), quantity: z.coerce.number().min(0) })).optional(),
});

export interface IndentLineDto { commodityId: string; commodityName: string; unit: Unit; requested: number; approved: number; shipped: number; received: number }
export interface IndentDto {
  id: string;
  indentNo: string;
  requesting: FacilityRef;
  supplying: FacilityRef;
  neededBy: string;
  reason: string;
  notes?: string;
  status: IndentStatus;
  lines: IndentLineDto[];
  shipmentIds: string[];
  history: { status: IndentStatus; at: string; actor: ActorRef; comment?: string }[];
  createdAt: string;
  createdBy: ActorRef;
}
