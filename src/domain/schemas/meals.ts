import { z } from 'zod';
import { MEAL_TYPES, WASTAGE_REASONS, type MealType, type SchoolCategory, type Unit, type WastageReason } from '../enums';
import type { ActorRef, FacilityRef, Ref } from './common';
import { nonNegativeQty, positiveQty } from './common';

export const recipeSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(16),
  name: z.string().trim().min(3).max(120),
  mealType: z.enum(MEAL_TYPES),
  description: z.string().max(400).optional(),
  ingredients: z
    .array(
      z.object({
        commodityId: z.string().min(1),
        /** Quantity per serving, in the commodity's unit, per school category. */
        perServing: z.object({ PRIMARY: positiveQty, UPPER_PRIMARY: positiveQty }),
      }),
    )
    .min(1),
});
export type RecipeInput = z.infer<typeof recipeSchema>;

export interface NutritionEstimate {
  energyKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  ironMg: number;
  calciumMg: number;
}

export interface RecipeDto {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  mealType: MealType;
  description?: string;
  version: number;
  status: 'APPROVED' | 'DRAFT' | 'RETIRED';
  approvedBy?: ActorRef;
  approvedAt?: string;
  ingredients: { commodityId: string; commodityName: string; unit: Unit; perServing: Record<SchoolCategory, number> }[];
  /** Estimated from approved reference values — never a laboratory result. */
  estimate: Record<SchoolCategory, NutritionEstimate>;
  normCheck: Record<SchoolCategory, { energyPct: number; proteinPct: number; meets: boolean }>;
}

export interface MenuCycleDto {
  tenantId: string;
  programmeCode: string;
  /** dayOfWeek (0=Sun) → mealType → recipe */
  days: { dayOfWeek: number; meals: { mealType: MealType; recipe: Ref }[] }[];
}

export interface MealPlanDto {
  date: string;
  facility: FacilityRef;
  mealType: MealType;
  recipe: Ref;
  expected: Record<SchoolCategory, number>;
  requirements: {
    commodityId: string;
    commodityName: string;
    unit: Unit;
    required: number;
    available: number;
    shortfall: number;
    suggestedLots: { lotId: string; lotCode: string; expiresOn: string; quantity: number }[];
  }[];
  canProduce: boolean;
  production?: { id: string; batchNo: string };
}

export const productionCreateSchema = z.object({
  facilityId: z.string().min(1),
  date: z.iso.date(),
  mealType: z.enum(MEAL_TYPES),
  recipeId: z.string().min(1),
  plannedServings: positiveQty,
  preparedServings: nonNegativeQty,
  startedAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
  completedAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
  consumption: z.array(z.object({ lotId: z.string().min(1), quantity: positiveQty })).min(1, 'Record the ingredients used'),
  tasteTested: z.boolean(),
  remarks: z.string().max(500).optional(),
  clientRef: z.string().max(64).optional(),
});
export type ProductionCreateInput = z.infer<typeof productionCreateSchema>;

export interface ProductionDto {
  id: string;
  batchNo: string;
  facility: FacilityRef;
  date: string;
  mealType: MealType;
  recipe: Ref;
  plannedServings: number;
  preparedServings: number;
  startedAt: string;
  completedAt: string;
  consumption: { lotId: string; lotCode: string; commodityId: string; commodityName: string; unit: Unit; quantity: number; plannedQuantity: number }[];
  tasteTested: boolean;
  estimatePerServing: NutritionEstimate;
  servedToSchoolIds: string[];
  recordedBy: ActorRef;
  createdAt: string;
}

export const mealServiceCreateSchema = z
  .object({
    schoolId: z.string().min(1),
    date: z.iso.date(),
    mealType: z.enum(MEAL_TYPES),
    productionBatchId: z.string().optional(),
    enrolled: z.coerce.number().int().min(0),
    present: z.coerce.number().int().min(0),
    mealsAvailable: z.coerce.number().int().min(0),
    mealsServed: z.coerce.number().int().min(0),
    leftoverServings: z.coerce.number().int().min(0),
    wastageKg: nonNegativeQty,
    wastageReason: z.enum(WASTAGE_REASONS).optional(),
    serviceInterrupted: z.boolean().default(false),
    interruptionReason: z.string().max(300).optional(),
    remarks: z.string().max(500).optional(),
    clientRef: z.string().max(64).optional(),
  })
  .refine((m) => m.present <= m.enrolled, { path: ['present'], message: 'Present cannot exceed enrolled' })
  .refine((m) => m.mealsServed <= m.mealsAvailable, { path: ['mealsServed'], message: 'Served cannot exceed meals available' })
  .refine((m) => m.mealsServed + m.leftoverServings <= m.mealsAvailable, { path: ['leftoverServings'], message: 'Served + leftover cannot exceed meals available' })
  .refine((m) => m.wastageKg === 0 || !!m.wastageReason, { path: ['wastageReason'], message: 'Give a reason for the wastage' })
  .refine((m) => !m.serviceInterrupted || !!m.interruptionReason, { path: ['interruptionReason'], message: 'Describe the interruption' });
export type MealServiceCreateInput = z.infer<typeof mealServiceCreateSchema>;

export interface MealServiceDto {
  id: string;
  school: FacilityRef;
  districtName: string;
  blockName?: string;
  date: string;
  mealType: MealType;
  productionBatchId?: string;
  batchNo?: string;
  enrolled: number;
  present: number;
  mealsAvailable: number;
  mealsServed: number;
  leftoverServings: number;
  wastageKg: number;
  wastageReason?: WastageReason;
  serviceInterrupted: boolean;
  interruptionReason?: string;
  remarks?: string;
  coveragePct: number;
  reportedAt: string;
  reportedBy: ActorRef;
  late: boolean;
}

export interface SchoolDayStatusDto {
  school: FacilityRef;
  districtName: string;
  blockName?: string;
  enrolment: number;
  category: SchoolCategory;
  meals: { mealType: MealType; status: 'REPORTED' | 'PENDING' | 'INTERRUPTED'; served?: number; present?: number }[];
}

export const hygieneCheckSchema = z.object({
  facilityId: z.string().min(1),
  date: z.iso.date(),
  items: z.array(z.object({ key: z.string(), label: z.string(), passed: z.boolean(), note: z.string().max(200).optional() })).min(1),
});
export type HygieneCheckInput = z.infer<typeof hygieneCheckSchema>;
export const HYGIENE_CHECKLIST = [
  { key: 'water', label: 'Drinking water source tested / RO working' },
  { key: 'cook_health', label: 'Cooks in clean attire, hairnet and apron' },
  { key: 'handwash', label: 'Handwash with soap before cooking and serving' },
  { key: 'storage', label: 'Grains stored off-floor in covered bins' },
  { key: 'pest', label: 'No signs of pests in store or kitchen' },
  { key: 'utensils', label: 'Utensils washed and dried' },
  { key: 'fuel', label: 'LPG cylinder and stove safe' },
  { key: 'taste', label: 'Food tasted by two adults before serving' },
] as const;
export interface HygieneCheckDto extends HygieneCheckInput {
  id: string;
  facility: FacilityRef;
  score: number;
  checkedBy: ActorRef;
  createdAt: string;
}

export const menuUpdateSchema = z.object({
  days: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), meals: z.array(z.object({ mealType: z.enum(MEAL_TYPES), recipeCode: z.string().min(1) })) })),
});
export type MenuUpdateInput = z.infer<typeof menuUpdateSchema>;
