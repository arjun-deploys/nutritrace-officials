import { z } from 'zod';
import type { ExceptionStatus, ExceptionType, Severity } from '../enums';
import type { ActorRef, FacilityRef } from './common';

export interface KpiDto {
  key: string;
  label: string;
  value: number;
  unit?: '%' | 'kg' | 'count' | 'days' | 'hours';
  previous?: number;
  /** Higher is better unless false. Drives colour of the delta. */
  higherIsBetter?: boolean;
  target?: number;
  hint?: string;
}

export interface FunnelStepDto {
  key: string;
  label: string;
  value: number;
  unit: string;
  note?: string;
}

export interface OverviewDto {
  asOf: string;
  scopeLabel: string;
  kpis: KpiDto[];
  mealFunnel: FunnelStepDto[];
  supplyFunnel: FunnelStepDto[];
  trend: { date: string; expected: number; served: number; reportingPct: number }[];
  stockRisk: { commodityName: string; daysOfCover: number | null; unit: string; onHand: number }[];
  exceptionsBySeverity: Record<Severity, number>;
}

export interface AreaPerformanceDto {
  geoPath: string;
  name: string;
  schools: number;
  reportingPct: number;
  coveragePct: number;
  mealsServed: number;
  onTimeDeliveryPct: number;
  stockDaysOfCover: number | null;
  wastagePct: number;
  openExceptions: number;
  traceCompletenessPct: number;
}

export interface ExceptionDto {
  id: string;
  exceptionNo: string;
  type: ExceptionType;
  severity: Severity;
  status: ExceptionStatus;
  title: string;
  detail: string;
  facility?: FacilityRef;
  geoPath: string;
  entity?: { kind: 'LOT' | 'SHIPMENT' | 'SCHOOL' | 'FACILITY' | 'RECALL' | 'PRODUCTION'; id: string; label: string };
  owner?: { role: string; name?: string };
  createdAt: string;
  dueAt: string;
  ageHours: number;
  overdue: boolean;
  log: { action: string; note?: string; at: string; by: ActorRef }[];
}

export const exceptionActionSchema = z.object({
  action: z.enum(['ACKNOWLEDGE', 'RESOLVE', 'ESCALATE', 'REOPEN']),
  note: z.string().trim().min(3, 'Add a short note').max(500),
});
export type ExceptionActionInput = z.infer<typeof exceptionActionSchema>;

export interface NotificationDto {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  at: string;
  actor: ActorRef;
  service: string;
  action: string;
  entity: { kind: string; id: string; label?: string };
  changes?: { field: string; from?: unknown; to?: unknown }[];
  ip?: string;
  requestId?: string;
}
