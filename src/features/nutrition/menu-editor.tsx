import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MealType, RecipeDto, TenantDto } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormError } from '@/components/shared/form';
import { meals } from '@/lib/api';
import { MEAL_LABEL } from '@/config/status';
import { toast } from 'sonner';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type MenuRow = { programmeCode: string; days: { dayOfWeek: number; meals: { mealType: string; recipeCode: string }[] }[] };

/** Which approved recipe is cooked on which day, per programme. Only approved recipes can be chosen. */
export function MenuEditor({ programmeCode, menu, tenant, recipes, onClose }: { programmeCode?: string; menu?: MenuRow; tenant?: TenantDto; recipes: RecipeDto[]; onClose: () => void }) {
  const qc = useQueryClient();
  const programme = tenant?.config.programmes.find((p) => p.code === programmeCode);
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!programmeCode) return;
    setError(undefined);
    setGrid(Object.fromEntries((menu?.days ?? []).flatMap((d) => d.meals.map((m) => [`${d.dayOfWeek}|${m.mealType}`, m.recipeCode]))));
  }, [programmeCode, menu]);
  const days = tenant?.config.operatingDays ?? [];
  const mealTypes = (programme?.mealTypes ?? []) as MealType[];
  const m = useMutation({
    mutationFn: () => meals.saveMenu(programmeCode!, { days: days.map((d) => ({ dayOfWeek: d, meals: mealTypes.filter((mt) => grid[`${d}|${mt}`]).map((mt) => ({ mealType: mt, recipeCode: grid[`${d}|${mt}`]! })) })) }),
    meta: { silent: true },
    onSuccess: () => { toast.success('Menu saved. Kitchen plans use it from today.'); void qc.invalidateQueries({ queryKey: ['menus'] }); void qc.invalidateQueries({ queryKey: ['plans'] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Dialog open={!!programmeCode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Weekly menu — {programme?.name}</DialogTitle><DialogDescription>Choose the approved recipe for each school day. Kitchens see it in their daily plan with the quantities they need.</DialogDescription></DialogHeader>
        <FormError message={error} />
        <div className="space-y-2">
          {days.map((d) => (
            <div key={d} className="grid items-center gap-3" style={{ gridTemplateColumns: `7rem repeat(${mealTypes.length}, minmax(0,1fr))` }}>
              <span className="text-sm font-medium">{DAYS[d]}</span>
              {mealTypes.map((mt) => (
                <Select key={mt} value={grid[`${d}|${mt}`] ?? ''} onValueChange={(v) => setGrid((g) => ({ ...g, [`${d}|${mt}`]: v }))}>
                  <SelectTrigger className="w-full" aria-label={`${MEAL_LABEL[mt]} on ${DAYS[d]}`}><SelectValue placeholder={`${MEAL_LABEL[mt]}: choose`} /></SelectTrigger>
                  <SelectContent>{recipes.filter((r) => r.status === 'APPROVED' && r.mealType === mt).map((r) => <SelectItem key={r.id} value={r.code}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
              ))}
            </div>
          ))}
        </div>
        <DialogFooter><Button loading={m.isPending} onClick={() => m.mutate()}>Save menu</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
