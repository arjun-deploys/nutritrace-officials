import { z } from 'zod';
import { CAPA_STATUSES, INSPECTION_RESULTS, INSPECTION_TYPES, QUALITY_DECISIONS, SEVERITIES, type CapaStatus, type InspectionResult, type InspectionType, type QualityDecision, type RecallStatus, type Severity } from '../enums';
import type { ActorRef, FacilityRef } from './common';
import { evidenceSchema } from './common';
import type { LotRef } from './inventory';

export const inspectionCreateSchema = z.object({
  type: z.enum(INSPECTION_TYPES),
  facilityId: z.string().min(1),
  lotId: z.string().optional(),
  sampledAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
  labRef: z.string().max(60).optional(),
  parameters: z
    .array(z.object({ name: z.string().min(1), value: z.string().min(1), unit: z.string().optional(), limit: z.string().optional(), passed: z.boolean() }))
    .min(1, 'Record at least one parameter'),
  result: z.enum(INSPECTION_RESULTS),
  remarks: z.string().max(800).optional(),
  evidence: z.array(evidenceSchema).max(10).default([]),
});
export type InspectionCreateInput = z.infer<typeof inspectionCreateSchema>;

export const qualityDecisionSchema = z.object({
  decision: z.enum(QUALITY_DECISIONS),
  reason: z.string().trim().min(5, 'Explain the decision').max(500),
});
export type QualityDecisionInput = z.infer<typeof qualityDecisionSchema>;

export interface InspectionDto {
  id: string;
  inspectionNo: string;
  type: InspectionType;
  facility: FacilityRef;
  lot?: LotRef;
  sampledAt: string;
  labRef?: string;
  parameters: z.infer<typeof inspectionCreateSchema>['parameters'];
  result: InspectionResult;
  remarks?: string;
  decision?: { decision: QualityDecision; reason: string; by: ActorRef; at: string };
  inspector: ActorRef;
  createdAt: string;
}

export const capaCreateSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(1000),
  source: z.enum(['INSPECTION', 'RECALL', 'COMPLAINT', 'AUDIT']),
  sourceRef: z.string().optional(),
  facilityId: z.string().min(1),
  ownerName: z.string().min(2),
  dueDate: z.iso.date(),
  severity: z.enum(SEVERITIES),
});
export type CapaCreateInput = z.infer<typeof capaCreateSchema>;
export const capaUpdateSchema = z.object({ status: z.enum(CAPA_STATUSES), note: z.string().min(3).max(500) });

export interface CapaDto extends Omit<CapaCreateInput, 'facilityId'> {
  id: string;
  capaNo: string;
  facility: FacilityRef;
  status: CapaStatus;
  log: { status: CapaStatus; note: string; at: string; by: ActorRef }[];
  createdAt: string;
  overdue: boolean;
}

export const recallCreateSchema = z.object({
  lotIds: z.array(z.string()).min(1, 'Select the affected lot'),
  reason: z.string().trim().min(10, 'Describe why the lot is being recalled').max(1000),
  severity: z.enum(SEVERITIES),
  instruction: z.string().trim().min(10).max(1000),
});
export type RecallCreateInput = z.infer<typeof recallCreateSchema>;

export const recallAckSchema = z.object({
  facilityId: z.string().min(1),
  quarantinedQty: z.coerce.number().min(0),
  note: z.string().max(300).optional(),
});

export interface RecallAffectedDto {
  facility: FacilityRef;
  districtName: string;
  receivedQty: number;
  consumedQty: number;
  onHandQty: number;
  mealsServedWithLot: number;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: ActorRef;
  quarantinedQty?: number;
}

export interface RecallDto {
  id: string;
  recallNo: string;
  lots: LotRef[];
  reason: string;
  instruction: string;
  severity: Severity;
  status: RecallStatus;
  initiatedBy: ActorRef;
  initiatedAt: string;
  closedAt?: string;
  affected: RecallAffectedDto[];
  stats: { facilities: number; acknowledged: number; onHandQty: number; consumedQty: number; mealsServed: number; schools: number };
}
