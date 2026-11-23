import { z } from 'zod';
import { PERMISSIONS, ROLES } from '../permissions';
import { COMMODITY_CATEGORIES, FACILITY_TYPES, MEAL_TYPES, SCHOOL_CATEGORIES, UNITS, type CommodityCategory, type FacilityType, type SchoolCategory, type Unit } from '../enums';
import { geoPointSchema } from './common';

/** Per-state programme configuration — what makes the platform multi-state without code changes. */
export const tenantConfigSchema = z.object({
  hierarchyLevels: z.array(z.string().min(2)).min(1).max(5),
  languages: z.array(z.string().min(2).max(5)).min(1),
  programmes: z.array(z.object({ code: z.string().min(2), name: z.string().min(2), mealTypes: z.array(z.enum(MEAL_TYPES)).min(1) })).min(1),
  operatingDays: z.array(z.number().int().min(0).max(6)).min(1),
  thresholds: z.object({
    lowStockDaysOfCover: z.number().min(1).max(60),
    expiryWarningDays: z.number().min(1).max(180),
    receiptVarianceTolerancePct: z.number().min(0).max(20),
    wastageTolerancePct: z.number().min(0).max(50),
    shipmentDelayGraceHours: z.number().min(0).max(72),
    schoolReportCutoffHour: z.number().min(8).max(23),
  }),
  nutritionNorms: z.array(
    z.object({ schoolCategory: z.enum(SCHOOL_CATEGORIES), mealType: z.enum(MEAL_TYPES), energyKcal: z.number().positive(), proteinG: z.number().positive() }),
  ),
  access: z.object({
    overrides: z.partialRecord(z.enum(ROLES), z.array(z.enum(PERMISSIONS))).optional(),
    customRoles: z.array(z.object({
      id: z.string().min(1), name: z.string().trim().min(3).max(60), description: z.string().max(200).optional(),
      baseRole: z.enum(ROLES), permissions: z.array(z.enum(PERMISSIONS)), active: z.boolean(),
    })).optional(),
  }).optional(),
});
export type TenantConfig = z.infer<typeof tenantConfigSchema>;

export interface TenantDto {
  id: string;
  code: string;
  name: string;
  shortName: string;
  isDemo: boolean;
  config: TenantConfig;
}

export interface GeoUnitDto {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  level: number;
  levelName: string;
  parentId: string | null;
  geoPath: string;
}

export const facilityCreateSchema = z.object({
  code: z.string().trim().min(2).max(32),
  name: z.string().trim().min(3).max(160),
  type: z.enum(FACILITY_TYPES),
  geoUnitId: z.string().min(1, 'Choose the administrative area'),
  address: z.string().trim().max(300).optional(),
  location: geoPointSchema.optional(),
  inCharge: z.object({ name: z.string().max(120), phone: z.string().max(15) }).partial().optional(),
  storageCapacityKg: z.coerce.number().min(0).optional(),
  school: z
    .object({
      udiseCode: z.string().regex(/^\d{11}$/, 'UDISE+ code has 11 digits'),
      category: z.enum(SCHOOL_CATEGORIES),
      enrolment: z.coerce.number().int().min(1),
      hasKitchen: z.boolean().default(true),
      servedByKitchenId: z.string().optional(),
      programmes: z.array(z.string()).min(1),
    })
    .optional(),
});
export type FacilityCreateInput = z.infer<typeof facilityCreateSchema>;

export interface FacilityDto {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: FacilityType;
  geoUnitId: string;
  geoPath: string;
  districtName: string;
  blockName?: string;
  address?: string;
  location?: { lat: number; lng: number };
  inCharge?: { name?: string; phone?: string };
  storageCapacityKg?: number;
  active: boolean;
  school?: {
    udiseCode: string;
    category: SchoolCategory;
    enrolment: number;
    hasKitchen: boolean;
    servedByKitchenId?: string;
    programmes: string[];
  };
}

export const commodityCreateSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(12).regex(/^[A-Z0-9-]+$/),
  name: z.string().trim().min(2).max(120),
  localNames: z.record(z.string(), z.string()).optional(),
  category: z.enum(COMMODITY_CATEGORIES),
  unit: z.enum(UNITS),
  shelfLifeDays: z.coerce.number().int().min(1).max(1500),
  storage: z.string().max(200).optional(),
  specification: z.string().max(500).optional(),
  nutritionPer100: z.object({
    energyKcal: z.coerce.number().min(0),
    proteinG: z.coerce.number().min(0),
    fatG: z.coerce.number().min(0),
    carbsG: z.coerce.number().min(0),
    ironMg: z.coerce.number().min(0),
    calciumMg: z.coerce.number().min(0),
  }),
  /** Grams per unit (1000 for KG). Lets nutrition math work for eggs and packets. */
  gramsPerUnit: z.coerce.number().positive(),
  nutritionSource: z.string().max(120).default('IFCT 2017 (NIN) — verify before go-live'),
});
export type CommodityCreateInput = z.infer<typeof commodityCreateSchema>;
export interface CommodityDto extends CommodityCreateInput {
  id: string;
  tenantId: string;
  category: CommodityCategory;
  unit: Unit;
  active: boolean;
}

export const supplierCreateSchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(3).max(160),
  gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN'),
  fssaiLicence: z.string().regex(/^\d{14}$/, 'FSSAI licence has 14 digits'),
  fssaiValidUntil: z.iso.date(),
  commodityIds: z.array(z.string()).min(1, 'Pick at least one commodity'),
  contact: z.object({ name: z.string().min(2), phone: z.string().min(10), email: z.email().optional().or(z.literal('')) }),
  address: z.string().max(300),
});
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export interface SupplierDto extends SupplierCreateInput {
  id: string;
  tenantId: string;
  status: 'APPROVED' | 'PENDING_VERIFICATION' | 'SUSPENDED';
  scorecard: { onTimePct: number; inFullPct: number; qualityPassPct: number; lotsSupplied: number };
}

export const vehicleCreateSchema = z.object({
  registrationNo: z.string().trim().toUpperCase().regex(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/, 'Use format like TN09AB1234'),
  transporterName: z.string().min(2),
  capacityKg: z.coerce.number().positive(),
  gpsDeviceId: z.string().optional(),
  driver: z.object({ name: z.string().min(2), phone: z.string().min(10) }),
});
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;
export interface VehicleDto extends VehicleCreateInput {
  id: string;
  tenantId: string;
  active: boolean;
}

export const geoUnitCreateSchema = z.object({
  code: z.string().trim().toUpperCase().min(2, 'Use at least 2 characters').max(16).regex(/^[A-Z0-9-]+$/, 'Letters, numbers and dashes only'),
  name: z.string().trim().min(2, 'Enter the name').max(80),
  parentId: z.string().min(1, 'Choose the parent area'),
});
export type GeoUnitCreateInput = z.infer<typeof geoUnitCreateSchema>;

export const supplierUpdateSchema = supplierCreateSchema.omit({ code: true }).partial();
export const commodityUpdateSchema = commodityCreateSchema.omit({ code: true }).partial().extend({ active: z.boolean().optional() });
export const vehicleUpdateSchema = vehicleCreateSchema.partial().extend({ active: z.boolean().optional() });

/**
 * One row of a facility bulk import (CSV). Areas are given by name or code so
 * a UDISE+ export can be used after renaming columns. Rows upsert by `code`.
 */
const blankToUndefined = (v: unknown) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' && x.trim() === '' ? undefined : x])) : v);
export const facilityImportRowSchema = z.preprocess(blankToUndefined, z.object({
  code: z.string().trim().min(2, 'code is required').max(32),
  name: z.string().trim().min(3, 'name is required').max(160),
  type: z.enum(FACILITY_TYPES, { error: `type must be one of ${FACILITY_TYPES.join(', ')}` }),
  district: z.string().trim().optional(),
  block: z.string().trim().optional(),
  udise: z.string().trim().optional(),
  category: z.enum(SCHOOL_CATEGORIES).optional(),
  enrolment: z.coerce.number().int().min(0).optional(),
  hasKitchen: z.enum(['yes', 'no', 'true', 'false', 'YES', 'NO', 'TRUE', 'FALSE', '']).optional(),
  programmes: z.string().trim().optional(),
  address: z.string().trim().max(300).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  inChargeName: z.string().trim().max(120).optional(),
  inChargePhone: z.string().trim().max(15).optional(),
  capacityKg: z.coerce.number().min(0).optional(),
}).superRefine((r, ctx) => {
  if (r.type === 'SCHOOL') {
    if (!r.udise || !/^\d{11}$/.test(r.udise)) ctx.addIssue({ code: 'custom', path: ['udise'], message: 'Schools need an 11-digit UDISE+ code' });
    if (!r.category) ctx.addIssue({ code: 'custom', path: ['category'], message: 'Schools need category PRIMARY or UPPER_PRIMARY' });
    if (!r.enrolment) ctx.addIssue({ code: 'custom', path: ['enrolment'], message: 'Schools need enrolment' });
  }
  if (r.type !== 'STATE_WAREHOUSE' && !r.district) ctx.addIssue({ code: 'custom', path: ['district'], message: 'district is required' });
  if (r.type === 'SCHOOL' && !r.block) ctx.addIssue({ code: 'custom', path: ['block'], message: 'Schools need a block' });
}));
export type FacilityImportRow = z.infer<typeof facilityImportRowSchema>;
export const FACILITY_IMPORT_COLUMNS = ['code', 'name', 'type', 'district', 'block', 'udise', 'category', 'enrolment', 'hasKitchen', 'programmes', 'address', 'lat', 'lng', 'inChargeName', 'inChargePhone', 'capacityKg'] as const;
export interface FacilityImportResult { dryRun: boolean; total: number; created: number; updated: number; errors: { row: number; code?: string; message: string }[] }

/** Tiny RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). Shared by UI preview and server. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
