import type { ExceptionType, Severity } from '../enums';
import type { TenantConfig } from '../schemas/registry';
import { round } from './fefo';

export const pct = (part: number, whole: number, dp = 1) => (whole > 0 ? round((part / whole) * 100, dp) : 0);

export function daysOfCover(available: number, avgDailyConsumption: number): number | null {
  if (avgDailyConsumption <= 0) return null;
  return round(available / avgDailyConsumption, 1);
}

export interface ExceptionCandidate {
  type: ExceptionType;
  severity: Severity;
  title: string;
  detail: string;
  slaHours: number;
}

/** Rule book. Thresholds come from tenant config so each state tunes its own tolerance. */
export const rules = {
  shipmentDelay(delayHours: number, cfg: TenantConfig, label: string): ExceptionCandidate | null {
    if (delayHours <= cfg.thresholds.shipmentDelayGraceHours) return null;
    return {
      type: 'DELAYED_SHIPMENT',
      severity: delayHours > 48 ? 'HIGH' : 'MEDIUM',
      title: `Shipment ${label} is ${Math.round(delayHours)} h late`,
      detail: 'Expected arrival window has passed without an arrival or receipt.',
      slaHours: 24,
    };
  },
  receiptVariance(expected: number, received: number, cfg: TenantConfig, label: string, unit: string): ExceptionCandidate | null {
    if (expected <= 0) return null;
    const variance = pct(Math.abs(expected - received), expected);
    if (variance <= cfg.thresholds.receiptVarianceTolerancePct) return null;
    return {
      type: 'QUANTITY_MISMATCH',
      severity: variance > 5 ? 'HIGH' : 'MEDIUM',
      title: `Receipt short by ${round(expected - received)} ${unit.toLowerCase()} on ${label}`,
      detail: `Dispatched ${expected}, received ${received} (${variance}% variance). Reconcile before closing.`,
      slaHours: 48,
    };
  },
  wastage(wastePct: number, cfg: TenantConfig, label: string): ExceptionCandidate | null {
    if (wastePct <= cfg.thresholds.wastageTolerancePct) return null;
    return {
      type: 'UNUSUAL_WASTAGE',
      severity: wastePct > cfg.thresholds.wastageTolerancePct * 2 ? 'HIGH' : 'MEDIUM',
      title: `Leftover meals at ${wastePct}% in ${label}`,
      detail: 'Leftovers exceeded the configured tolerance. Review planning and attendance figures.',
      slaHours: 72,
    };
  },
  lowStock(dOC: number | null, cfg: TenantConfig, label: string): ExceptionCandidate | null {
    if (dOC === null || dOC >= cfg.thresholds.lowStockDaysOfCover) return null;
    return {
      type: 'LOW_STOCK',
      severity: dOC < 2 ? 'CRITICAL' : dOC < cfg.thresholds.lowStockDaysOfCover / 2 ? 'HIGH' : 'MEDIUM',
      title: `${label} has ${dOC} days of cover`,
      detail: `Below the ${cfg.thresholds.lowStockDaysOfCover}-day threshold. Raise replenishment.`,
      slaHours: 24,
    };
  },
  expiry(daysToExpiry: number, qty: number, cfg: TenantConfig, label: string): ExceptionCandidate | null {
    if (daysToExpiry > cfg.thresholds.expiryWarningDays || qty <= 0) return null;
    return {
      type: 'EXPIRY_RISK',
      severity: daysToExpiry <= 7 ? 'HIGH' : 'MEDIUM',
      title: `${label} expires in ${daysToExpiry} days`,
      detail: `${qty} on hand. Prioritise issue or transfer, or plan disposal.`,
      slaHours: 72,
    };
  },
};
