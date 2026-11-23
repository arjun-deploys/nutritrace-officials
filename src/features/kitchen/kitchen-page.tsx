import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ChefHat, CheckCircle2, ClipboardCheck } from 'lucide-react';
import type { MealPlanDto, ProductionDto } from '@nt/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { FacilityPicker } from '@/components/shared/facility-picker';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState, LoadingBlock } from '@/components/shared/states';
import { LotLink } from '@/components/shared/links';
import { meals } from '@/lib/api';
import { date, num, qty, today, unit, dateTime } from '@/lib/format';
import { MEAL_LABEL } from '@/config/status';
import { useCan, useUser } from '@/stores/auth';
import { newKey } from '@/stores/offline-queue';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function KitchenPage() {
  const user = useUser();
  const [facilityId, setFacilityId] = useState(user.facilityId ?? '');
  const [day, setDay] = useState(today());
  const plans = useQuery(meals.plans({ facilityId, date: day }, !!facilityId));
  const productions = useQuery(meals.productions({ facilityId: facilityId || undefined, pageSize: 10 }));
  const columns: ColumnDef<ProductionDto, unknown>[] = [
    { header: 'Batch', cell: ({ row }) => <span className="code-id">{row.original.batchNo}</span> },
    { header: 'Day', cell: ({ row }) => date(row.original.date) },
    { header: 'Meal', cell: ({ row }) => `${MEAL_LABEL[row.original.mealType]} · ${row.original.recipe.name}` },
    { header: 'Kitchen', cell: ({ row }) => <span className="block max-w-48 truncate">{row.original.facility.name}</span> },
    { header: 'Prepared', cell: ({ row }) => num(row.original.preparedServings), meta: { align: 'right' } },
    { header: 'Est. energy / protein', cell: ({ row }) => `${num(row.original.estimatePerServing.energyKcal)} kcal · ${num(row.original.estimatePerServing.proteinG)} g`, meta: { align: 'right' } },
    { header: 'Lots used', cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.consumption.map((c) => <LotLink key={c.lotId} id={c.lotId} code={c.lotCode} className="text-xs" />)}</div> },
  ];
  return (
    <Page>
      <PageHeader title="Kitchen" description="Today's menu, what it needs from stock, and the record of each cooking batch. Ingredients are issued lot by lot so every meal is traceable." />
      <Section>
        <div className="flex flex-wrap items-end gap-4">
          {!user.facilityId && <div className="w-full max-w-md space-y-1.5"><Label>Kitchen</Label><FacilityPicker value={facilityId} onChange={setFacilityId} types={['SCHOOL', 'CENTRAL_KITCHEN']} placeholder="Choose a school or central kitchen" /></div>}
          <div className="space-y-1.5"><Label htmlFor="kd">Day</Label><Input id="kd" type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} className="w-44" /></div>
          {facilityId && <HygieneDialog facilityId={facilityId} day={day} />}
        </div>
      </Section>
      {!facilityId ? <Section><EmptyState icon={<ChefHat className="size-8" />} title="Choose a kitchen" description="Pick a school kitchen or central kitchen to see its plan for the day." /></Section>
        : plans.isPending ? <LoadingBlock rows={4} />
        : !plans.data?.length ? <Section><EmptyState title={`No meals scheduled on ${date(day)}`} description="It may be a holiday, or the menu has no meal for this day." /></Section>
        : <div className="grid gap-6 xl:grid-cols-2">{plans.data.map((p) => <PlanCard key={p.mealType} plan={p} />)}</div>}
      <Section title="Recent batches" bodyClassName="p-0 [&>div>div]:rounded-none [&>div>div]:border-0">
        <DataTable columns={columns} rows={productions.data?.data} loading={productions.isPending} empty={{ title: 'No batches recorded yet' }} />
      </Section>
    </Page>
  );
}

function PlanCard({ plan }: { plan: MealPlanDto }) {
  const canProduce = useCan('meal:produce');
  const expected = plan.expected.PRIMARY + plan.expected.UPPER_PRIMARY;
  return (
    <Section
      title={`${MEAL_LABEL[plan.mealType]} · ${plan.recipe.name}`}
      description={`Expected ${num(expected)} children (${num(plan.expected.PRIMARY)} primary, ${num(plan.expected.UPPER_PRIMARY)} upper primary), from recent attendance.`}
      actions={plan.production ? <Badge tone="success"><CheckCircle2 /> Cooked · {plan.production.batchNo}</Badge> : canProduce && <ProduceDialog plan={plan} />}
      bodyClassName="p-0"
    >
      <Table>
        <TableHeader className="bg-muted/50"><TableRow><TableHead className="text-xs">Ingredient</TableHead><TableHead className="text-right text-xs">Needed</TableHead><TableHead className="text-right text-xs">Usable stock</TableHead><TableHead className="text-xs">Use lots (FEFO)</TableHead></TableRow></TableHeader>
        <TableBody>
          {plan.requirements.map((r) => (
            <TableRow key={r.commodityId}>
              <TableCell>{r.commodityName}</TableCell>
              <TableCell className="text-right num">{qty(r.required, r.unit)}</TableCell>
              <TableCell className={cn('text-right num', r.shortfall > 0 && 'font-medium text-danger')}>{qty(r.available, r.unit)}{r.shortfall > 0 && <span className="block text-xs">short {qty(r.shortfall, r.unit)}</span>}</TableCell>
              <TableCell><div className="flex flex-wrap gap-1">{r.suggestedLots.map((l) => <LotLink key={l.lotId} id={l.lotId} code={l.lotCode} className="text-xs" />)}</div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!plan.canProduce && !plan.production && <p className="border-t px-5 py-3 text-sm text-danger">Stock is short for this meal. Raise a replenishment request or use an approved substitute.</p>}
    </Section>
  );
}

function ProduceDialog({ plan }: { plan: MealPlanDto }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key] = useState(newKey);
  const expected = plan.expected.PRIMARY + plan.expected.UPPER_PRIMARY;
  const [prepared, setPrepared] = useState(String(expected));
  const [tasted, setTasted] = useState(false);
  const [use, setUse] = useState<Record<string, string>>(() => Object.fromEntries(plan.requirements.flatMap((r) => r.suggestedLots.map((l) => [l.lotId, String(l.quantity)]))));
  const lots = plan.requirements.flatMap((r) => r.suggestedLots.map((l) => ({ ...l, commodityName: r.commodityName, unit: r.unit })));
  const m = useMutation({
    mutationFn: () => {
      const now = new Date();
      return meals.produce({
        facilityId: plan.facility.id, date: plan.date, mealType: plan.mealType, recipeId: plan.recipe.id, plannedServings: expected, preparedServings: Number(prepared),
        startedAt: new Date(now.getTime() - 2 * 3_600_000).toISOString(), completedAt: now.toISOString(), tasteTested: tasted, clientRef: key,
        consumption: Object.entries(use).filter(([, v]) => Number(v) > 0).map(([lotId, v]) => ({ lotId, quantity: Number(v) })),
      }, key);
    },
    onSuccess: (p) => { toast.success(`${p.batchNo}: ${num(p.preparedServings)} servings recorded`); setOpen(false); void qc.invalidateQueries({ queryKey: ['plans'] }); void qc.invalidateQueries({ queryKey: ['productions'] }); },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" disabled={!plan.canProduce}><ChefHat /> Record cooking</Button></DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{MEAL_LABEL[plan.mealType]} · {plan.recipe.name}</DialogTitle><DialogDescription>Record what was actually used from each lot, not what the recipe planned.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="prep">Servings prepared</Label><Input id="prep" type="number" value={prepared} onChange={(e) => setPrepared(e.target.value)} className="w-40" /></div>
          <div className="space-y-2">
            {lots.map((l) => (
              <div key={l.lotId} className="flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="code-id text-sm text-trace-ink">{l.lotCode}</p><p className="text-xs text-muted-foreground">{l.commodityName}</p></div>
                <div className="flex items-center gap-1"><Input type="number" step="any" className="h-8 w-28 text-right" value={use[l.lotId] ?? ''} onChange={(e) => setUse((u) => ({ ...u, [l.lotId]: e.target.value }))} aria-label={`Quantity used from ${l.lotCode}`} /><span className="w-6 text-xs text-muted-foreground">{unit(l.unit)}</span></div>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={tasted} onCheckedChange={(v) => setTasted(v === true)} /> Food was tasted by two adults before serving</label>
        </div>
        <DialogFooter><Button disabled={!tasted || !Number(prepared)} loading={m.isPending} onClick={() => m.mutate()}>Save batch</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HygieneDialog({ facilityId, day }: { facilityId: string; day: string }) {
  const tpl = useQuery(meals.hygieneTemplate());
  const recent = useQuery(meals.hygieneChecks({ facilityId, pageSize: 1 }));
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Record<string, boolean>>({});
  const m = useMutation({
    mutationFn: () => meals.recordHygiene({ facilityId, date: day, items: (tpl.data ?? []).map((i) => ({ key: i.key, label: i.label, passed: !!state[i.key] })) }),
    onSuccess: (h) => { toast.success(`Hygiene check recorded: ${h.score}%`); setOpen(false); void qc.invalidateQueries({ queryKey: ['hygiene'] }); },
  });
  const last = recent.data?.data[0];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><ClipboardCheck /> Hygiene check{last && <span className="text-xs text-muted-foreground">· last {last.score}% on {date(last.date)}</span>}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Daily hygiene check</DialogTitle><DialogDescription>Tick each item that was checked and found in order. {last && `Last check by ${last.checkedBy.name}, ${dateTime(last.createdAt)}.`}</DialogDescription></DialogHeader>
        <ul className="space-y-2.5">
          {(tpl.data ?? []).map((i) => <li key={i.key}><label className="flex items-start gap-2.5 text-sm"><Checkbox checked={!!state[i.key]} onCheckedChange={(v) => setState((s) => ({ ...s, [i.key]: v === true }))} className="mt-0.5" />{i.label}</label></li>)}
        </ul>
        <DialogFooter><Button loading={m.isPending} onClick={() => m.mutate()}>Save check</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
