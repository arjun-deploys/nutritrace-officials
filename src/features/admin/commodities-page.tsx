import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { COMMODITY_CATEGORIES, commodityCreateSchema, UNITS, type CommodityCreateInput, type CommodityDto } from '@nt/domain';
import { Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { Field, FormError, FormSelect } from '@/components/shared/form';
import { registry } from '@/lib/api';
import { humanize, num, unit } from '@/lib/format';
import { useCan } from '@/stores/auth';
import { toast } from 'sonner';
import { ExchangeActions } from '@/admin/components/exchange';

/** The food items the programme handles, with the unit they are counted in and nutrition per 100 g. */
export default function CommoditiesPage() {
  const q = useQuery(registry.commodities());
  const canManage = useCan('master:manage');
  const [editing, setEditing] = useState<CommodityDto | 'new'>();
  const columns: ColumnDef<CommodityDto, unknown>[] = [
    { header: 'Item', cell: ({ row }) => <div><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.code}{row.original.localNames && ` · ${Object.values(row.original.localNames).join(' · ')}`}</p></div> },
    { header: 'Category', cell: ({ row }) => humanize(row.original.category) },
    { header: 'Counted in', cell: ({ row }) => unit(row.original.unit) },
    { header: 'Shelf life', cell: ({ row }) => `${num(row.original.shelfLifeDays)} days`, meta: { align: 'right' } },
    { header: 'Energy / protein per 100 g', cell: ({ row }) => `${num(row.original.nutritionPer100.energyKcal)} kcal · ${num(row.original.nutritionPer100.proteinG)} g`, meta: { align: 'right' } },
    { header: 'Status', cell: ({ row }) => <Badge tone={row.original.active ? 'success' : 'neutral'}>{row.original.active ? 'In use' : 'Retired'}</Badge> },
    ...(canManage ? [{ id: 'e', header: '', cell: ({ row }) => <Button size="sm" variant="ghost" onClick={() => setEditing(row.original)}><Pencil /> Edit</Button> } as ColumnDef<CommodityDto, unknown>] : []),
  ];
  return (
    <Page>
      <PageHeader title="Products" description="Everything the programme buys and cooks. Shelf life drives first-expiry-first-out; nutrition values drive the recipe estimates." actions={<><ExchangeActions entity="commodities" invalidate={['commodities']} />{canManage && <Button onClick={() => setEditing('new')}><Plus /> Add product</Button>}</>} />
      <DataTable columns={columns} rows={q.data} loading={q.isPending} getRowId={(c) => c.id} />
      <CommodityDialog item={editing === 'new' ? undefined : editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </Page>
  );
}

type In = z.input<typeof commodityCreateSchema>;
const EMPTY: In = { code: '', name: '', category: 'CEREAL', unit: 'KG', shelfLifeDays: 180, gramsPerUnit: 1000, storage: '', specification: '', nutritionPer100: { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0, ironMg: 0, calciumMg: 0 }, nutritionSource: 'IFCT 2017 (NIN)', localNames: {} };

function CommodityDialog({ item, open, onClose }: { item?: CommodityDto; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const tenant = useQuery(registry.tenant());
  const [error, setError] = useState<string>();
  const [active, setActive] = useState(true);
  const form = useForm<In, unknown, CommodityCreateInput>({ resolver: zodResolver(commodityCreateSchema), defaultValues: EMPTY });
  useEffect(() => { if (open) { setError(undefined); setActive(item?.active ?? true); form.reset(item ? { ...item, localNames: item.localNames ?? {} } : EMPTY); } }, [open, item, form]);
  const m = useMutation({
    mutationFn: (v: CommodityCreateInput) => (item ? registry.updateCommodity(item.id, { ...v, code: undefined, active } as Partial<CommodityCreateInput>) : registry.createCommodity(v)),
    meta: { silent: true },
    onSuccess: (c) => { toast.success(`${c.name} saved`); void qc.invalidateQueries({ queryKey: ['commodities'] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  const e = form.formState.errors;
  const langs = (tenant.data?.config.languages ?? []).filter((l) => l !== 'en');
  const unitValue = form.watch('unit');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{item ? `Edit ${item.name}` : 'Add food item'}</DialogTitle><DialogDescription>Nutrition values are per 100 g of edible portion. Cite the source so estimates can be audited.</DialogDescription></DialogHeader>
        <form id="commodity-form" className="grid gap-3 sm:grid-cols-3" onSubmit={form.handleSubmit((v) => { setError(undefined); m.mutate(v); })} noValidate>
          <div className="sm:col-span-3"><FormError message={error} /></div>
          <Field label="Name" error={e.name} required className="sm:col-span-2"><Input {...form.register('name')} placeholder="e.g. Egg (hen, ~50 g)" /></Field>
          <Field label="Code" error={e.code} required hint="Used in lot codes, e.g. EGG"><Input {...form.register('code')} className="uppercase" disabled={!!item} /></Field>
          <FormSelect control={form.control} name="category" label="Category" options={COMMODITY_CATEGORIES.map((c) => ({ value: c, label: humanize(c) }))} />
          <FormSelect control={form.control} name="unit" label="Counted in" options={UNITS.map((u) => ({ value: u, label: humanize(u) }))} disabled={!!item} />
          <Field label={`Grams per ${unitValue === 'KG' ? 'kg' : unitValue.toLowerCase()}`} error={e.gramsPerUnit} hint={unitValue === 'PIECE' ? 'e.g. 50 for an egg' : undefined}><Input type="number" step="any" {...form.register('gramsPerUnit')} /></Field>
          <Field label="Shelf life (days)" error={e.shelfLifeDays}><Input type="number" {...form.register('shelfLifeDays')} /></Field>
          <Field label="Storage" className="sm:col-span-2"><Input {...form.register('storage')} placeholder="e.g. Cool, ventilated trays" /></Field>
          <Field label="Specification" className="sm:col-span-3"><Input {...form.register('specification')} placeholder="e.g. FCI Grade A, moisture ≤ 14%" /></Field>
          {langs.map((l) => <Field key={l} label={`Name in ${l.toUpperCase()}`}><Input {...form.register(`localNames.${l}` as `localNames.${string}`)} /></Field>)}
          <fieldset className="grid gap-3 rounded-md border p-3 sm:col-span-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium">Per 100 g</legend>
            {([['energyKcal', 'Energy (kcal)'], ['proteinG', 'Protein (g)'], ['fatG', 'Fat (g)'], ['carbsG', 'Carbohydrate (g)'], ['ironMg', 'Iron (mg)'], ['calciumMg', 'Calcium (mg)']] as const).map(([k, l]) => (
              <Field key={k} label={l} error={e.nutritionPer100?.[k]}><Input type="number" step="any" {...form.register(`nutritionPer100.${k}`)} /></Field>
            ))}
            <Field label="Source" className="sm:col-span-3"><Input {...form.register('nutritionSource')} /></Field>
          </fieldset>
          {item && <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={active} onChange={(ev) => setActive(ev.target.checked)} /> In use (untick to retire; history is kept)</label>}
        </form>
        <DialogFooter><Button type="submit" form="commodity-form" loading={m.isPending}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
