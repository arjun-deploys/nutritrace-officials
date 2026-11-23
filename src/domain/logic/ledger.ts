import type { TraceEventDto } from '../schemas/trace';
import { canonicalJson, sha256Hex } from './sha256';

export const GENESIS_HASH = '0'.repeat(64);

export type UnhashedEvent = Omit<TraceEventDto, 'hash' | 'prevHash'>;

/**
 * Fields covered by the hash. Display-only denormalised names are excluded so
 * renaming a facility never breaks the chain; identities and quantities are in.
 */
export function hashPayload(e: UnhashedEvent & { prevHash: string }) {
  return {
    tenantId: e.tenantId,
    seq: e.seq,
    type: e.type,
    occurredAt: e.occurredAt,
    lotId: e.lotId,
    quantity: e.quantity,
    quantityKind: e.quantityKind,
    unit: e.unit,
    from: e.from?.id,
    to: e.to?.id,
    facility: e.facility?.id,
    refs: e.refs,
    meals: e.meals,
    actor: e.actor.userId,
    evidence: e.evidence?.map((x) => x.sha256 ?? x.url),
    prevHash: e.prevHash,
  };
}

export function sealEvent(e: UnhashedEvent, prevHash: string): TraceEventDto {
  const withPrev = { ...e, prevHash };
  return { ...withPrev, hash: sha256Hex(canonicalJson(hashPayload(withPrev))) };
}

/** Walk the chain in sequence order; returns the first broken sequence if any. */
export function verifyChain(events: readonly TraceEventDto[], expectedPrev = GENESIS_HASH) {
  let prev = expectedPrev;
  for (const e of events) {
    if (e.prevHash !== prev) return { verified: false, eventsChecked: events.length, brokenAtSeq: e.seq };
    const recomputed = sha256Hex(canonicalJson(hashPayload(e)));
    if (recomputed !== e.hash) return { verified: false, eventsChecked: events.length, brokenAtSeq: e.seq };
    prev = e.hash;
  }
  return { verified: true, eventsChecked: events.length, headHash: prev };
}
