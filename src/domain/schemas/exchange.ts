import { z } from 'zod';
import { COMMODITY_CATEGORIES, UNITS } from '../enums';

/**
 * Data exchange descriptors. One entry per entity that can be imported and
 * exported. The UI builds templates and help text from these; the server
 * validates rows with the same schemas.
 */
const blank = (v: unknown) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' && x.trim() === '' ? undefined : x])) : v);

export const locationImportRowSchema = z.preprocess(blank, z.object({
  code: z.string().trim().toUpperCase().min(2, 'code is required').max(16).regex(/^[A-Z0-9-]+$/, 'code: letters, numbers, dashes'),
  name: z.string().trim().min(2, 'name is required').max(80),
  parent: z.string().trim().min(1, 'parent is required (code or name of the area above)'),
}));
export const supplierImportRowSchema = z.preprocess(blank, z.object({
  code: z.string().trim().min(2, 'code is required').max(20),
  name: z.string().trim().min(3, 'name is required').max(160),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'gstin is not valid'),
  fssaiLicence: z.string().trim().regex(/^\d{14}$/, 'fssaiLicence must have 14 digits'),
  fssaiValidUntil: z.iso.date({ error: 'fssaiValidUntil must be a date YYYY-MM-DD' }),
  commodities: z.string().trim().min(2, 'commodities is required (codes separated by ;)'),
  contactName: z.string().trim().min(2, 'contactName is required'),
  contactPhone: z.string().trim().min(10, 'contactPhone is required'),
  contactEmail: z.email().optional(),
  address: z.string().trim().max(300).optional(),
}));
export const commodityImportRowSchema = z.preprocess(blank, z.object({
  code: z.string().trim().toUpperCase().min(2).max(12).regex(/^[A-Z0-9-]+$/, 'code: letters, numbers, dashes'),
  name: z.string().trim().min(2, 'name is required'),
  category: z.enum(COMMODITY_CATEGORIES, { error: `category must be one of ${COMMODITY_CATEGORIES.join(', ')}` }),
  unit: z.enum(UNITS, { error: `unit must be one of ${UNITS.join(', ')}` }),
  shelfLifeDays: z.coerce.number().int().min(1).max(1500),
  gramsPerUnit: z.coerce.number().positive(),
  energyKcal: z.coerce.number().min(0), proteinG: z.coerce.number().min(0), fatG: z.coerce.number().min(0).default(0),
  carbsG: z.coerce.number().min(0).default(0), ironMg: z.coerce.number().min(0).default(0), calciumMg: z.coerce.number().min(0).default(0),
  nutritionSource: z.string().trim().optional(),
}));
export const vehicleImportRowSchema = z.preprocess(blank, z.object({
  registrationNo: z.string().trim().toUpperCase().regex(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/, 'registrationNo like TN09AB1234'),
  transporterName: z.string().trim().min(2, 'transporterName is required'),
  capacityKg: z.coerce.number().positive(),
  driverName: z.string().trim().min(2, 'driverName is required'),
  driverPhone: z.string().trim().min(10, 'driverPhone is required'),
  gpsDeviceId: z.string().trim().optional(),
}));

export const EXCHANGE_ENTITIES = ['locations', 'facilities', 'suppliers', 'commodities', 'vehicles', 'users'] as const;
export type ExchangeEntity = (typeof EXCHANGE_ENTITIES)[number];

export interface ExchangeDescriptor {
  entity: ExchangeEntity;
  label: string;
  description: string;
  keyColumn: string;
  columns: string[];
  example: string[][];
  notes: string[];
}

export const EXCHANGE: Record<ExchangeEntity, ExchangeDescriptor> = {
  locations: { entity: 'locations', label: 'Levels & locations', description: 'Districts, blocks (taluks, mandals) under the state.', keyColumn: 'code', columns: ['code', 'name', 'parent'],
    example: [['MDU', 'Madurai', 'TN'], ['VDP', 'Vadipatti', 'MDU']], notes: ['parent is the code or name of the area one level above', 'rows can be in any order within a level; list higher levels first'] },
  facilities: { entity: 'facilities', label: 'Schools & facilities', description: 'Warehouses, central kitchens and schools (UDISE+).', keyColumn: 'code',
    columns: ['code', 'name', 'type', 'district', 'block', 'udise', 'category', 'enrolment', 'hasKitchen', 'programmes', 'address', 'lat', 'lng', 'inChargeName', 'inChargePhone', 'capacityKg'],
    example: [['TN-SCH-MDU-0901', 'PUPS Example Village', 'SCHOOL', 'Madurai', 'Melur', '33030199999', 'PRIMARY', '180', 'yes', 'PMPOSHAN;CMBS', 'Example Village', '10.03', '78.33', 'K. Meenakshi', '9840000000', '']],
    notes: ['type: STATE_WAREHOUSE, DISTRICT_WAREHOUSE, BLOCK_STORE, CENTRAL_KITCHEN or SCHOOL', 'schools need udise (11 digits), category, enrolment and block'] },
  suppliers: { entity: 'suppliers', label: 'Suppliers', description: 'Food suppliers with GSTIN and FSSAI licence. New suppliers start as pending verification.', keyColumn: 'code',
    columns: ['code', 'name', 'gstin', 'fssaiLicence', 'fssaiValidUntil', 'commodities', 'contactName', 'contactPhone', 'contactEmail', 'address'],
    example: [['SUP-KON', 'Kongu Poultry Producers Co-operative', '33AABCK1234Q1Z5', '12345678901234', '2028-03-31', 'EGG', 'R. Kumar', '9876543210', '', 'Namakkal']],
    notes: ['commodities: product codes separated by ;', 'imported suppliers must still be approved by an officer'] },
  commodities: { entity: 'commodities', label: 'Products', description: 'Food items with unit, shelf life and nutrition per 100 g.', keyColumn: 'code',
    columns: ['code', 'name', 'category', 'unit', 'shelfLifeDays', 'gramsPerUnit', 'energyKcal', 'proteinG', 'fatG', 'carbsG', 'ironMg', 'calciumMg', 'nutritionSource'],
    example: [['MILK', 'Milk powder', 'MILK', 'KG', '180', '1000', '496', '26', '27', '38', '0.5', '912', 'IFCT 2017']], notes: ['unit cannot be changed for an existing product'] },
  vehicles: { entity: 'vehicles', label: 'Vehicles', description: 'Delivery vehicles and their drivers.', keyColumn: 'registrationNo',
    columns: ['registrationNo', 'transporterName', 'capacityKg', 'driverName', 'driverPhone', 'gpsDeviceId'], example: [['TN59CD4321', 'Madurai Logistics', '6000', 'Selvam', '9876501234', 'GPS-11223']], notes: [] },
  users: { entity: 'users', label: 'Users', description: 'Staff accounts with role and area. Temporary passwords are generated and shown once.', keyColumn: 'username',
    columns: ['username', 'name', 'role', 'location', 'facilityCode', 'phone', 'email'],
    example: [['hm.vadipatti1', 'S. Lakshmi', 'SCHOOL_HEAD', 'VDP', 'TN-SCH-MDU-0901', '9840011111', '']],
    notes: ['location: code or name of the user’s area', 'facilityCode is required for headmasters, kitchen managers and warehouse operators', 'existing usernames are updated (role, area, contact); passwords are not changed'] },
};

export interface ImportResult { entity: ExchangeEntity; dryRun: boolean; total: number; created: number; updated: number; errors: { row: number; code?: string; message: string }[]; credentials?: { username: string; temporaryPassword: string }[] }

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const headers = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}
