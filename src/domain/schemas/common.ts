import { z } from 'zod';
import type { FacilityType } from '../enums';
import type { Role } from '../permissions';

export const idSchema = z.string().trim().min(1, 'Required').max(64);
export const positiveQty = z.coerce.number({ error: 'Enter a number' }).positive('Must be more than zero').max(10_000_000);
export const nonNegativeQty = z.coerce.number({ error: 'Enter a number' }).min(0, 'Cannot be negative').max(10_000_000);
export const geoPointSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(40).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const evidenceSchema = z.object({
  kind: z.enum(['PHOTO', 'DOCUMENT', 'SIGNATURE', 'CERTIFICATE', 'INVOICE', 'WEIGHMENT_SLIP', 'LAB_REPORT']),
  name: z.string().max(200),
  url: z.string().max(1000),
  sha256: z.string().length(64).optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
export interface Envelope<T> {
  data: T;
}
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

/** Compact reference used for denormalised display fields. */
export interface Ref {
  id: string;
  name: string;
  code?: string;
}
export interface FacilityRef extends Ref {
  type: FacilityType;
  geoPath: string;
}
export interface ActorRef {
  userId: string;
  name: string;
  role: Role;
}
