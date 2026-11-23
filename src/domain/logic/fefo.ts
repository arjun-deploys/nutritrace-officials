import { BLOCKED_LOT_STATUSES, type LotStatus } from '../enums';
import type { FefoPick } from '../schemas/inventory';

export interface AllocatableRow {
  lotId: string;
  lotCode: string;
  expiresOn: string;
  receivedAt?: string;
  available: number;
  status: LotStatus;
}

/**
 * First-expiry-first-out allocation. Blocked and expired lots are skipped;
 * ties on expiry fall back to first-in (receivedAt). Returns picks and any shortfall.
 */
export function allocateFefo(rows: readonly AllocatableRow[], quantity: number, today = new Date().toISOString().slice(0, 10)) {
  const eligible = rows
    .filter((r) => r.available > 0 && !BLOCKED_LOT_STATUSES.includes(r.status) && r.expiresOn >= today)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || (a.receivedAt ?? '').localeCompare(b.receivedAt ?? ''));
  const picks: FefoPick[] = [];
  let remaining = quantity;
  for (const r of eligible) {
    if (remaining <= 1e-9) break;
    const take = Math.min(r.available, remaining);
    picks.push({ lotId: r.lotId, lotCode: r.lotCode, expiresOn: r.expiresOn, quantity: round(take) });
    remaining -= take;
  }
  return { picks, shortfall: round(Math.max(0, remaining)) };
}

export function round(n: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
