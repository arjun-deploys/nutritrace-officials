import {
  allocateFefo, checkNorm, estimateServing, HYGIENE_CHECKLIST, ingredientRequirement, mealServiceCreateSchema, pct, productionCreateSchema, round, rules,
  type FacilityDto, type MealPlanDto, type MealType, type NutritionRef, type ProductionDto, type RecipeDto, type SchoolCategory, type SchoolDayStatusDto, type Unit,
} from '@nt/domain';
import { audit, available, cell, conflict, facility, facRef, forbidden, invalid, moveStock, newId, nextNo, notFound, raise, trace, autoResolve } from '../ops';
import { actor, facilityAllowed, inScope, paginate, route, scopedGeo, type Ctx } from '../server';
import type { RecipeRow, TenantStore } from '../store';
import { setRecipeView } from './admin';

const refs = (s: TenantStore) => new Map<string, NutritionRef>(s.commodities.map((c) => [c.id, { commodityId: c.id, gramsPerUnit: c.gramsPerUnit, nutritionPer100: c.nutritionPer100 }]));
const CATS: SchoolCategory[] = ['PRIMARY', 'UPPER_PRIMARY'];

function recipeDto(s: TenantStore, r: RecipeRow): RecipeDto {
  const estimate = Object.fromEntries(CATS.map((c) => [c, estimateServing(r.ingredients.map((i) => ({ commodityId: i.commodityId, quantity: i.perServing[c] })), refs(s))])) as RecipeDto['estimate'];
  const normCheck = Object.fromEntries(CATS.map((c) => { const n = checkNorm(estimate[c], s.tenant.config, c, r.mealType); return [c, { energyPct: n.energyPct, proteinPct: n.proteinPct, meets: n.meets }]; })) as RecipeDto['normCheck'];
  return {
    id: r.id, tenantId: s.tenant.id, code: r.code, name: r.name, mealType: r.mealType, description: r.description, version: r.version, status: r.status, approvedBy: r.approvedBy, approvedAt: r.approvedAt,
    ingredients: r.ingredients.map((i) => { const c = s.commodities.find((x) => x.id === i.commodityId)!; return { commodityId: c.id, commodityName: c.name, unit: c.unit, perServing: i.perServing }; }),
    estimate, normCheck,
  };
}
setRecipeView((ctx, id) => recipeDto(ctx.s, ctx.s.recipes.find((r) => r.id === id)!));
route('GET', '/meals/recipes', (ctx) => ctx.s.recipes.filter((r) => r.status !== 'RETIRED').map((r) => recipeDto(ctx.s, r)).sort((a, b) => a.mealType.localeCompare(b.mealType) || a.name.localeCompare(b.name)), 'meal:read');
route('POST', '/meals/recipes/:id/approve', (ctx) => {
  const r = ctx.s.recipes.find((x) => x.id === ctx.params.id);
  if (!r || r.status !== 'DRAFT') throw conflict('Only drafts can be approved');
  for (const o of ctx.s.recipes) if (o.code === r.code && o.status === 'APPROVED') o.status = 'RETIRED';
  Object.assign(r, { status: 'APPROVED', approvedBy: actor(ctx), approvedAt: new Date().toISOString() });
  audit(ctx.s, actor(ctx), 'meals.recipe_approved', { kind: 'RECIPE', id: r.id, label: `${r.code} v${r.version}` });
  return { id: r.id, status: r.status, version: r.version };
}, 'nutrition:manage');
route('GET', '/meals/menus', (ctx) => ctx.s.menus, 'meal:read');

const mealTypesOf = (s: TenantStore, f: FacilityDto) => [...new Set(s.tenant.config.programmes.filter((p) => f.school?.programmes.includes(p.code)).flatMap((p) => p.mealTypes))] as MealType[];

route('GET', '/meals/plans', (ctx) => {
  const s = ctx.s;
  const f = facility(s, ctx.query.facilityId!);
  if (!facilityAllowed(ctx, f.id)) throw forbidden();
  const date = ctx.query.date!;
  const dow = new Date(`${date}T00:00:00`).getDay();
  if (!s.tenant.config.operatingDays.includes(dow)) return [];
  const plans: MealPlanDto[] = [];
  for (const mt of mealTypesOf(s, f)) {
    const menu = s.menus.find((m) => s.tenant.config.programmes.find((p) => p.code === m.programmeCode)?.mealTypes.includes(mt));
    const code = menu?.days.find((d) => d.dayOfWeek === dow)?.meals.find((m) => m.mealType === mt)?.recipeCode;
    const recipe = s.recipes.find((r) => r.code === code && r.status === 'APPROVED');
    if (!recipe) continue;
    const recent = s.services.filter((x) => x.school.id === f.id && x.mealType === mt).slice(-10);
    const att = recent.length ? recent.reduce((a, x) => a + x.present / x.enrolled, 0) / recent.length : 0.9;
    const expected = { PRIMARY: 0, UPPER_PRIMARY: 0 } as Record<SchoolCategory, number>;
    expected[f.school!.category] = Math.ceil(f.school!.enrolment * att);
    const prod = s.productions.find((p) => p.facility.id === f.id && p.date === date && p.mealType === mt);
    const requirements = recipe.ingredients.map((ing) => {
      const c = s.commodities.find((x) => x.id === ing.commodityId)!;
      const required = ingredientRequirement(ing.perServing, expected);
      const rows = s.lots.filter((l) => l.commodity.id === c.id && cell(s, f.id, l.id)).map((l) => ({ lotId: l.id, lotCode: l.code, expiresOn: l.expiresOn, receivedAt: cell(s, f.id, l.id)!.receivedAt, available: available(cell(s, f.id, l.id)), status: l.status }));
      const { picks, shortfall } = allocateFefo(rows, required, date);
      return { commodityId: c.id, commodityName: c.name, unit: c.unit as Unit, required, available: round(rows.filter((r) => r.status === 'RELEASED' && r.expiresOn >= date).reduce((a, r) => a + r.available, 0)), shortfall, suggestedLots: picks };
    });
    plans.push({ date, facility: facRef(f), mealType: mt, recipe: { id: recipe.id, name: recipe.name, code: recipe.code }, expected, requirements, canProduce: requirements.every((r) => r.shortfall === 0), production: prod ? { id: prod.id, batchNo: prod.batchNo } : undefined });
  }
  return plans;
}, 'meal:read');

const prodVisible = (ctx: Ctx, p: ProductionDto) => inScope(ctx, p.facility.geoPath) && facilityAllowed(ctx, p.facility.id);
route('GET', '/meals/productions', (ctx) => paginate(ctx.s.productions.filter((p) => prodVisible(ctx, p) && (!ctx.query.facilityId || p.facility.id === ctx.query.facilityId) && (!ctx.query.date || p.date === ctx.query.date)), ctx.query, 'createdAt'), 'meal:read');
route('GET', '/meals/productions/:id', (ctx) => ctx.s.productions.find((p) => p.id === ctx.params.id) ?? (() => { throw notFound('Meal batch'); })(), 'meal:read');
route('POST', '/meals/productions', (ctx) => {
  const r = productionCreateSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const b = r.data;
  const s = ctx.s;
  const dup = s.productions.find((p) => p.facility.id === b.facilityId && p.date === b.date && p.mealType === b.mealType);
  if (dup) { if (b.clientRef) return dup; throw conflict(`${b.mealType.toLowerCase()} for ${b.date} is already recorded (${dup.batchNo})`); }
  const f = facility(s, b.facilityId);
  if (!facilityAllowed(ctx, f.id)) throw forbidden();
  const recipe = s.recipes.find((x) => x.id === b.recipeId && x.status === 'APPROVED')!;
  const id = newId(s);
  const batchNo = nextNo(s, 'MPB', new Date());
  const a = actor(ctx);
  const consumption = b.consumption.map((c) => {
    const lot = moveStock(s, { facilityId: f.id, lotId: c.lotId, type: 'ISSUE', onHandDelta: -c.quantity, ref: { kind: 'PRODUCTION', id, label: batchNo }, at: b.completedAt, actor: a, requireReleased: true });
    const ing = recipe.ingredients.find((i) => i.commodityId === lot.commodity.id);
    return { lotId: lot.id, lotCode: lot.code, commodityId: lot.commodity.id, commodityName: lot.commodity.name, unit: lot.commodity.unit, quantity: c.quantity, plannedQuantity: ing ? round(ing.perServing[f.school?.category ?? 'PRIMARY'] * b.plannedServings) : 0 };
  });
  for (const c of consumption) trace(s, { type: 'CONSUMED', occurredAt: b.completedAt, lotId: c.lotId, lotCode: c.lotCode, commodityId: c.commodityId, quantity: c.quantity, unit: c.unit, quantityKind: 'CONSUMED', facility: facRef(f), refs: { productionId: id, batchNo }, actor: a });
  trace(s, { type: 'MEAL_PRODUCED', occurredAt: b.completedAt, quantity: b.preparedServings, quantityKind: 'NONE', facility: facRef(f), refs: { productionId: id, batchNo }, meals: { count: b.preparedServings, mealType: b.mealType }, actor: a });
  const p: ProductionDto = {
    id, batchNo, facility: facRef(f), date: b.date, mealType: b.mealType, recipe: { id: recipe.id, name: recipe.name, code: recipe.code }, plannedServings: b.plannedServings, preparedServings: b.preparedServings,
    startedAt: b.startedAt, completedAt: b.completedAt, consumption, tasteTested: b.tasteTested,
    estimatePerServing: estimateServing(consumption.map((c) => ({ commodityId: c.commodityId, quantity: b.preparedServings ? c.quantity / b.preparedServings : 0 })), refs(s)), servedToSchoolIds: [f.id], recordedBy: a, createdAt: new Date().toISOString(),
  };
  s.productions.push(p);
  return p;
}, 'meal:produce');

route('GET', '/meals/services', (ctx) => {
  const q = ctx.query;
  return paginate(ctx.s.services.filter((x) => inScope(ctx, x.school.geoPath) && facilityAllowed(ctx, x.school.id) && (!q.schoolId || x.school.id === q.schoolId) && (!q.mealType || x.mealType === q.mealType) && (!q.from || x.date >= q.from) && (!q.to || x.date <= q.to)), q, 'date');
}, 'meal:read');
route('GET', '/meals/services/status', (ctx) => {
  const s = ctx.s;
  const geo = scopedGeo(ctx);
  const date = ctx.query.date!;
  const reports = s.services.filter((x) => x.date === date);
  return s.facilities.filter((f) => f.type === 'SCHOOL' && f.geoPath.startsWith(geo) && facilityAllowed(ctx, f.id)).map<SchoolDayStatusDto>((f) => ({
    school: facRef(f), districtName: f.districtName, blockName: f.blockName, enrolment: f.school!.enrolment, category: f.school!.category,
    meals: mealTypesOf(s, f).map((mt) => { const r = reports.find((x) => x.school.id === f.id && x.mealType === mt); return { mealType: mt, status: !r ? 'PENDING' : r.serviceInterrupted ? 'INTERRUPTED' : 'REPORTED', served: r?.mealsServed, present: r?.present }; }),
  }));
}, 'meal:read');
route('POST', '/meals/services', (ctx) => {
  const r = mealServiceCreateSchema.safeParse(ctx.body);
  if (!r.success) throw invalid(r.error.issues[0]!.message);
  const b = r.data;
  const s = ctx.s;
  const f = facility(s, b.schoolId);
  if (!facilityAllowed(ctx, f.id)) throw forbidden();
  const existing = s.services.find((x) => x.school.id === f.id && x.date === b.date && x.mealType === b.mealType);
  if (existing) { if (b.clientRef) return existing; throw conflict(`${b.mealType.toLowerCase()} for ${b.date} is already reported`); }
  const prod = s.productions.find((p) => p.facility.id === f.id && p.date === b.date && p.mealType === b.mealType);
  if (!prod && !b.serviceInterrupted) throw conflict('No meal batch is recorded for this meal yet. Record the cooking first, or report an interruption.');
  const a = actor(ctx);
  const id = newId(s);
  const now = new Date();
  const svc = { ...b, id, school: facRef(f), districtName: f.districtName, blockName: f.blockName, productionBatchId: prod?.id, batchNo: prod?.batchNo, coveragePct: pct(b.mealsServed, b.present), reportedAt: now.toISOString(), reportedBy: a, late: now.getHours() >= s.tenant.config.thresholds.schoolReportCutoffHour };
  s.services.push(svc);
  if (prod && b.mealsServed > 0) trace(s, { type: 'MEAL_SERVED', occurredAt: now.toISOString(), quantity: b.mealsServed, quantityKind: 'SERVED', facility: facRef(f), refs: { productionId: prod.id, batchNo: prod.batchNo, mealServiceId: id }, meals: { count: b.mealsServed, mealType: b.mealType, schoolId: f.id }, actor: a });
  autoResolve(s, `MISSING:${f.id}:${b.date}:${b.mealType}`, 'Report received');
  const ctxx = { geoPath: f.geoPath, facility: facRef(f), entity: { kind: 'SCHOOL' as const, id: f.id, label: f.name }, link: `/schools/${f.id}` };
  if (b.present > 0 && b.mealsServed < b.present * 0.95) raise(s, `SHORT:${id}`, { type: 'MEAL_SHORTFALL', severity: b.mealsServed < b.present * 0.8 ? 'CRITICAL' : 'HIGH', title: `${b.present - b.mealsServed} children present were not served ${b.mealType.toLowerCase()} at ${f.name}`, detail: `${b.date}: present ${b.present}, served ${b.mealsServed}${b.interruptionReason ? `. ${b.interruptionReason}` : ''}.`, slaHours: 24 }, ctxx, now);
  const w = rules.wastage(pct(b.leftoverServings, b.mealsAvailable), s.tenant.config, `${f.name} (${b.date})`);
  if (w) raise(s, `WASTE:${id}`, w, ctxx, now);
  return svc;
}, 'meal:serve:report');

route('GET', '/meals/hygiene-checks/template', () => HYGIENE_CHECKLIST, 'meal:read');
route('GET', '/meals/hygiene-checks', (ctx) => paginate(ctx.s.hygiene.filter((h) => inScope(ctx, h.facility.geoPath) && facilityAllowed(ctx, h.facility.id) && (!ctx.query.facilityId || h.facility.id === ctx.query.facilityId)), ctx.query, 'date'), 'meal:read');
route('POST', '/meals/hygiene-checks', (ctx) => {
  const f = facility(ctx.s, ctx.body.facilityId);
  const items = ctx.body.items as { passed: boolean }[];
  const h = { ...ctx.body, id: newId(ctx.s), facility: facRef(f), score: Math.round((items.filter((i) => i.passed).length / items.length) * 100), checkedBy: actor(ctx), createdAt: new Date().toISOString() };
  ctx.s.hygiene.unshift(h);
  return h;
}, 'meal:produce');
