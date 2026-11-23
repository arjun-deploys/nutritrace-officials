import { formatDistanceToNowStrict, format as fmt, parseISO } from 'date-fns';
import type { Unit } from '@nt/domain';

const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const num = (v: number | null | undefined, dp: 1 | 2 = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : (dp === 2 ? nf2 : nf).format(v));
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${nf.format(v)}%`);

const UNIT_LABEL: Record<Unit, string> = { KG: 'kg', LITRE: 'L', PIECE: 'pcs', PACKET: 'pkt' };
export const unit = (u?: string) => (u ? UNIT_LABEL[u as Unit] ?? u.toLowerCase() : '');
export const qty = (v: number | null | undefined, u?: string) => (v === null || v === undefined ? '—' : `${num(v, 2)} ${unit(u)}`.trim());

/** Large quantities read as tonnes once they pass 10,000 kg. */
export const qtyShort = (v: number, u?: string) => (u === 'KG' && Math.abs(v) >= 10_000 ? `${nf.format(v / 1000)} t` : qty(v, u));

const toDate = (d: string | Date) => (typeof d === 'string' ? parseISO(d) : d);
export const date = (d?: string | Date | null) => (d ? fmt(toDate(d), 'd MMM yyyy') : '—');
export const dateShort = (d?: string | Date | null) => (d ? fmt(toDate(d), 'd MMM') : '—');
export const dateTime = (d?: string | Date | null) => (d ? fmt(toDate(d), 'd MMM yyyy, HH:mm') : '—');
export const time = (d?: string | Date | null) => (d ? fmt(toDate(d), 'HH:mm') : '—');
export const ago = (d?: string | Date | null) => (d ? `${formatDistanceToNowStrict(toDate(d))} ago` : '—');
export const today = () => new Date().toLocaleDateString('en-CA');
export const daysUntil = (d: string) => Math.ceil((parseISO(d).getTime() - Date.now()) / 86_400_000);

export const humanize = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ') : '—');
