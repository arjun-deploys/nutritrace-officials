import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { checkNorm, estimateServing, MEAL_TYPES, recipeSchema, type NutritionRef, type RecipeDto, type RecipeInput, type SchoolCategory } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FormError, FormSelect } from '@/components/shared/form';
import { meals, registry } from '@/lib/api';
import { num, unit } from '@/lib/format';
import { MEAL_LABEL } from '@/config/status';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type In = z.input<typeof recipeSchema>;
export type EditorMode = { kind: 'new' } | { kind: 'version'; from: RecipeDto } | { kind: 'edit'; recipe: RecipeDto };

/** New recipe, new version of an approved recipe, or edit of a draft. New versions need approval before menus use them. */
export function RecipeEditor({ mode, onClose }: { mode?: EditorMode; onClose: () => void }) {
  const qc = useQueryClient();
  const commodities = useQuery(registry.commodities());
  const tenant = useQuery(registry.tenant());
  const [error, setError] = useState<string>();
  const form = useForm<In, unknown, RecipeInput>({ resolver: zodResolver(recipeSchema), defaultValues: { code: '', name: '', mealType: 'LUNCH', description: '', ingredients: [] } });
  const ingredients = useFieldArray({ control: form.control, name: 'ingredients' });
  useEffect(() => {
    if (!mode) return;
    setError(undefined);
    const src = mode.kind === 'version' ? mode.from : mode.kind === 'edit' ? mode.recipe : undefined;
    form.reset(src ? { code: src.code, name: src.name, mealType: src.mealType, description: src.description ?? '', ingredients: src.ingredients.map((i) => ({ commodityId: i.commodityId, perServing: { ...i.perServing } })) }
      : { code: '', name: '', mealType: 'LUNCH', description: '', ingredients: [{ commodityId: '', perServing: { PRIMARY: '' as unknown as number, UPPER_PRIMARY: '' as unknown as number } }] });
  }, [mode, form]);
  const watched = form.watch();
  const preview = useMemo(() => {
    const refs = new Map<string, NutritionRef>((commodities.data ?? []).map((c) => [c.id, { commodityId: c.id, gramsPerUnit: c.gramsPerUnit, nutritionPer100: c.nutritionPer100 }]));
    return (['PRIMARY', 'UPPER_PRIMARY'] as SchoolCategory[]).map((cat) => {
      const est = estimateServing((watched.ingredients ?? []).map((i) => ({ commodityId: i.commodityId, quantity: Number(i.perServing?.[cat]) || 0 })), refs);
      return { cat, est, check: tenant.data ? checkNorm(est, tenant.data.config, cat, String(watched.mealType)) : undefined };
    });
  }, [watched, commodities.data, tenant.data]);
  const m = useMutation({
    mutationFn: (v: RecipeInput) => (mode?.kind === 'edit' ? meals.updateRecipe(mode.recipe.id, { ...v, code: undefined } as Partial<RecipeInput>) : meals.createRecipe(v)),
    meta: { silent: true },
    onSuccess: (r) => { toast.success(`${r.name} v${r.version} saved as draft — approve it to use it in menus`); void qc.invalidateQueries({ queryKey: ['recipes'] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  const e = form.formState.errors;
  const title = mode?.kind === 'version' ? `New version of ${mode.from.name}` : mode?.kind === 'edit' ? `Edit draft: ${mode.recipe.name}` : 'New recipe';
  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Quantities are per child per serving, in each item's unit (kg, litre or pieces). The estimate updates as you type.</DialogDescription></DialogHeader>
        <form id="recipe-form" className="space-y-4" onSubmit={form.handleSubmit((v) => { setError(undefined); m.mutate(v); })} noValidate>
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Code" error={e.code} required hint="e.g. L-SAMBAR"><Input {...form.register('code')} className="uppercase" disabled={mode?.kind !== 'new'} /></Field>
            <Field label="Name" error={e.name} required className="sm:col-span-2"><Input {...form.register('name')} /></Field>
            <FormSelect control={form.control} name="mealType" label="Meal" options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABEL[m]! }))} disabled={mode?.kind !== 'new'} />
            <Field label="Description" className="sm:col-span-2"><Input {...form.register('description')} /></Field>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground"><span>Ingredient</span><span>Primary</span><span>Upper primary</span><span className="w-9" /></div>
            {ingredients.fields.map((f, i) => {
              const c = commodities.data?.find((x) => x.id === watched.ingredients?.[i]?.commodityId);
              return (
                <div key={f.id} className="grid grid-cols-[2fr_1fr_1fr_auto] items-start gap-2">
                  <FormSelect control={form.control} name={`ingredients.${i}.commodityId`} label="" options={(commodities.data ?? []).filter((x) => x.active).map((x) => ({ value: x.id, label: x.name }))} />
                  <Field label="" error={e.ingredients?.[i]?.perServing?.PRIMARY}><Input type="number" step="any" placeholder={c ? unit(c.unit) : ''} {...form.register(`ingredients.${i}.perServing.PRIMARY`)} aria-label="Quantity for primary" /></Field>
                  <Field label="" error={e.ingredients?.[i]?.perServing?.UPPER_PRIMARY}><Input type="number" step="any" placeholder={c ? unit(c.unit) : ''} {...form.register(`ingredients.${i}.perServing.UPPER_PRIMARY`)} aria-label="Quantity for upper primary" /></Field>
                  <Button type="button" variant="ghost" size="icon" className="mt-1.5" onClick={() => ingredients.remove(i)} aria-label="Remove ingredient"><Trash2 /></Button>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => ingredients.append({ commodityId: '', perServing: { PRIMARY: '' as unknown as number, UPPER_PRIMARY: '' as unknown as number } })}><Plus /> Add ingredient</Button>
            {e.ingredients?.root?.message && <p className="text-xs text-danger">{e.ingredients.root.message}</p>}
          </div>
          <div className="grid gap-3 rounded-md bg-muted/60 p-3 sm:grid-cols-2">
            {preview.map((p) => (
              <div key={p.cat} className="text-sm">
                <p className="text-xs text-muted-foreground">{p.cat === 'PRIMARY' ? 'Primary' : 'Upper primary'} — estimated per serving</p>
                <p className="num"><strong>{num(p.est.energyKcal)}</strong> kcal <span className={cn('text-xs', (p.check?.energyPct ?? 0) >= 100 ? 'text-success' : 'text-warning')}>({p.check?.energyPct ?? 0}% of norm)</span> · <strong>{num(p.est.proteinG)}</strong> g protein <span className={cn('text-xs', (p.check?.proteinPct ?? 0) >= 100 ? 'text-success' : 'text-warning')}>({p.check?.proteinPct ?? 0}%)</span></p>
              </div>
            ))}
          </div>
        </form>
        <DialogFooter><Button type="submit" form="recipe-form" loading={m.isPending}>Save draft</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
