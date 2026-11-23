import type { SchoolCategory } from '../enums';
import type { NutritionEstimate } from '../schemas/meals';
import type { TenantConfig } from '../schemas/registry';
import { round } from './fefo';

export interface NutritionRef {
  commodityId: string;
  gramsPerUnit: number;
  nutritionPer100: NutritionEstimate;
}

export const EMPTY_ESTIMATE: NutritionEstimate = { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0, ironMg: 0, calciumMg: 0 };

/**
 * Estimated nutrients per serving = Σ (qty per serving × grams per unit / 100 × value per 100 g).
 * This is a planning estimate from reference tables, not a measured or absorbed value.
 */
export function estimateServing(
  ingredients: readonly { commodityId: string; quantity: number }[],
  refs: ReadonlyMap<string, NutritionRef>,
): NutritionEstimate {
  const total = { ...EMPTY_ESTIMATE };
  for (const ing of ingredients) {
    const ref = refs.get(ing.commodityId);
    if (!ref) continue;
    const grams = ing.quantity * ref.gramsPerUnit;
    for (const key of Object.keys(total) as (keyof NutritionEstimate)[]) {
      total[key] += (grams / 100) * ref.nutritionPer100[key];
    }
  }
  return Object.fromEntries(Object.entries(total).map(([k, v]) => [k, round(v, 1)])) as unknown as NutritionEstimate;
}

export function checkNorm(estimate: NutritionEstimate, config: TenantConfig, category: SchoolCategory, mealType: string) {
  const norm = config.nutritionNorms.find((n) => n.schoolCategory === category && n.mealType === mealType);
  if (!norm) return { energyPct: 0, proteinPct: 0, meets: false, norm: undefined };
  const energyPct = round((estimate.energyKcal / norm.energyKcal) * 100, 0);
  const proteinPct = round((estimate.proteinG / norm.proteinG) * 100, 0);
  return { energyPct, proteinPct, meets: energyPct >= 100 && proteinPct >= 100, norm };
}

/** Ingredient requirement for a meal: per-serving quantity × expected count per school category. */
export function ingredientRequirement(
  perServing: Record<SchoolCategory, number>,
  expected: Partial<Record<SchoolCategory, number>>,
): number {
  return round((expected.PRIMARY ?? 0) * perServing.PRIMARY + (expected.UPPER_PRIMARY ?? 0) * perServing.UPPER_PRIMARY);
}
