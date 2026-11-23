/** Human-readable document numbers: PREFIX-STATE-YYMM-NNNNN, e.g. PO-TN-2611-00042. */
export function docNo(prefix: string, stateCode: string, seq: number, at: Date | string = new Date()): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}-${stateCode}-${yy}${mm}-${String(seq).padStart(5, '0')}`;
}

/** Lot codes lead with the commodity so a field user can read them aloud: RICE-TN-2611-00007. */
export function lotCode(commodityCode: string, stateCode: string, seq: number, at: Date | string = new Date()): string {
  return docNo(commodityCode, stateCode, seq, at);
}

/** Payload encoded into lot QR labels. Contains no personal data. */
export function lotQrPayload(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/t/${encodeURIComponent(code)}`;
}

export const DOC_PREFIX = {
  PO: 'PO',
  ASN: 'ASN',
  SHIPMENT: 'SHP',
  GRN: 'GRN',
  ADJUSTMENT: 'ADJ',
  PRODUCTION: 'MPB',
  INSPECTION: 'INS',
  CAPA: 'CAPA',
  RECALL: 'RCL',
  EXCEPTION: 'EXC',
  INDENT: 'IND',
  TRIP: 'TRP',
} as const;

/** Short quantity label for summaries, e.g. "12 kg", "120 pcs". */
export function qtyLabel(q: number, unit: string): string {
  const u = { KG: 'kg', LITRE: 'L', PIECE: 'pcs', PACKET: 'pkt' }[unit] ?? unit.toLowerCase();
  return `${Math.round(q * 100) / 100} ${u}`;
}
