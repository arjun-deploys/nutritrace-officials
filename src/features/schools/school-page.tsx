import type { z } from 'zod';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { mealServiceCreateSchema, WASTAGE_REASONS, type MealServiceCreateInput, type MealServiceDto, type FacilityDto, type MealType } from '@nt/domain';
import { CloudOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader, Section, DetailList } from '@/components/shared/page';
import { QueryBoundary, LoadingBlock } from '@/components/shared/states';
import { Field, FormError, FormSelect } from '@/components/shared/form';
import { DataTable } from '@/components/data-table/data-table';
import { TraceLanes } from '@/features/trace/trace-graph';
import { LotLink } from '@/components/shared/links';
import { meals, registry, trace } from '@/lib/api';
import { isApiError } from '@/lib/http';
import { date, humanize, num, pct, qty, today } from '@/lib/format';
import { MEAL_LABEL } from '@/config/status';
import { useCan } from '@/stores/auth';
import { newKey, registerSender, useOfflineQueue } from '@/stores/offline-queue';
import { toast } from 'sonner';

registerSender('meal-service', (s) => meals.report(s.payload as MealServiceCreateInput, s.id));

export default function SchoolPage() {
  const { id = '' } = useParams();
  const school = useQuery(registry.facility(id));
  return <QueryBoundary query={school} loading={<Page><LoadingBlock rows={6} /></Page>}>{(s) => <SchoolView school={s} />}</QueryBoundary>;
}

function SchoolView({ school }: { school: FacilityDto }) {
  const canReport = useCan('meal:serve:report');
  const tenant = useQuery(registry.tenant());
  const mealTypes = [...new Set((tenant.data?.config.programmes ?? []).filter((p) => school.school?.programmes.includes(p.code)).flatMap((p) => p.mealTypes))] as MealType[];
  const history = useQuery(meals.services({ schoolId: school.id, pageSize: 30, sort: 'date' }));
  const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const sources = useQuery(trace.sources(school.id, from, today()));
  const columns: ColumnDef<MealServiceDto, unknown>[] = [
    { header: 'Day', cell: ({ row }) => date(row.original.date) },
    { header: 'Meal', cell: ({ row }) => MEAL_LABEL[row.original.mealType] },
    { header: 'Present', cell: ({ row }) => num(row.original.present), meta: { align: 'right' } },
    { header: 'Served', cell: ({ row }) => num(row.original.mealsServed), meta: { align: 'right' } },
    { header: 'Fed of present', cell: ({ row }) => <span className={row.original.coveragePct < 95 ? 'font-medium text-danger' : undefined}>{pct(row.original.coveragePct)}</span>, meta: { align: 'right' } },
    { header: 'Leftover', cell: ({ row }) => num(row.original.leftoverServings), meta: { align: 'right' } },
    { header: 'Batch', cell: ({ row }) => <span className="code-id text-xs text-muted-foreground">{row.original.batchNo ?? '—'}</span> },
    { header: '', id: 'flags', cell: ({ row }) => <div className="flex gap-1">{row.original.serviceInterrupted && <Badge tone="danger">Interrupted</Badge>}{row.original.late && <Badge tone="warning">Late</Badge>}</div> },
  ];
  return (
    <Page>
      <PageHeader back={{ to: '/schools', label: 'Schools' }} title={school.name} description={`${school.blockName ?? ''}${school.blockName ? ', ' : ''}${school.districtName} · UDISE+ ${school.school?.udiseCode}`}
        meta={<span className="text-sm text-muted-foreground">{num(school.school?.enrolment ?? 0)} enrolled · {humanize(school.school?.category)} · {school.school?.hasKitchen ? 'cooks on site' : 'served by a central kitchen'}</span>} />
      <Tabs defaultValue={canReport ? 'report' : 'history'}>
        <TabsList>
          {canReport && <TabsTrigger value="report">Today's report</TabsTrigger>}
          <TabsTrigger value="history">Meal record</TabsTrigger>
          <TabsTrigger value="sources">Where the food came from</TabsTrigger>
          <TabsTrigger value="about">School details</TabsTrigger>
        </TabsList>
        {canReport && (
          <TabsContent value="report" className="mt-4 grid gap-6 lg:grid-cols-2">
            {mealTypes.map((mt) => <MealReportForm key={mt} school={school} mealType={mt} />)}
          </TabsContent>
        )}
        <TabsContent value="history" className="mt-4">
          <DataTable columns={columns} rows={history.data?.data} loading={history.isPending} empty={{ title: 'No meals reported yet' }} />
        </TabsContent>
        <TabsContent value="sources" className="mt-4 space-y-6">
          <Section title="Backward trace, last 14 days" description="Every lot cooked into meals served here, and the supplier and warehouses each came through.">
            {sources.isPending ? <LoadingBlock /> : sources.data ? (
              <div className="space-y-6">
                <p className="text-sm num">{num(sources.data.mealsServed)} meals over {sources.data.days} days used {sources.data.usage.length} lots.</p>
                <ul className="divide-y rounded-md border">
                  {sources.data.usage.map((u) => (
                    <li key={u.lot.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="flex items-center gap-3"><LotLink id={u.lot.id} code={u.lot.code} /><span>{u.lot.commodity.name}</span></span>
                      <span className="text-muted-foreground">{u.lot.supplier.name}</span>
                      <span className="num">{qty(u.consumed, u.lot.commodity.unit)} in {u.batches} {u.batches === 1 ? 'batch' : 'batches'}</span>
                    </li>
                  ))}
                </ul>
                <TraceLanes graph={sources.data.graph} emptyText="No meals linked to lots in this period." />
              </div>
            ) : null}
          </Section>
        </TabsContent>
        <TabsContent value="about" className="mt-4">
          <Section><DetailList columns={3} items={[
            { label: 'School code', value: school.code }, { label: 'UDISE+', value: school.school?.udiseCode }, { label: 'Category', value: humanize(school.school?.category) },
            { label: 'Enrolment', value: num(school.school?.enrolment ?? 0) }, { label: 'Programmes', value: school.school?.programmes.join(', ') }, { label: 'Headmaster', value: school.inCharge?.name ? `${school.inCharge.name}, ${school.inCharge.phone ?? ''}` : undefined },
            { label: 'Address', value: school.address },
          ]} /></Section>
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function MealReportForm({ school, mealType }: { school: FacilityDto; mealType: MealType }) {
  const qc = useQueryClient();
  const enqueue = useOfflineQueue((s) => s.enqueue);
  const queued = useOfflineQueue((s) => s.items.some((i) => i.kind === 'meal-service' && (i.payload as MealServiceCreateInput).schoolId === school.id && (i.payload as MealServiceCreateInput).mealType === mealType && (i.payload as MealServiceCreateInput).date === today()));
  const existing = useQuery(meals.services({ schoolId: school.id, from: today(), to: today(), mealType }));
  const plan = useQuery(meals.plans({ facilityId: school.school?.hasKitchen ? school.id : school.school?.servedByKitchenId ?? '', date: today() }, !!school.school));
  const prepared = plan.data?.find((p) => p.mealType === mealType)?.production;
  const [key, setKey] = useState(newKey);
  const [error, setError] = useState<string>();
  const enrolled = school.school?.enrolment ?? 0;
  const form = useForm<z.input<typeof mealServiceCreateSchema>, unknown, MealServiceCreateInput>({
    resolver: zodResolver(mealServiceCreateSchema),
    defaultValues: { schoolId: school.id, date: today(), mealType, enrolled, present: undefined as unknown as number, mealsAvailable: undefined as unknown as number, mealsServed: undefined as unknown as number, leftoverServings: 0, wastageKg: 0, serviceInterrupted: false, remarks: '' },
  });
  const interrupted = form.watch('serviceInterrupted');
  const m = useMutation({
    mutationFn: (v: MealServiceCreateInput) => meals.report({ ...v, clientRef: key }, key),
    meta: { silent: true },
    onSuccess: () => { toast.success(`${MEAL_LABEL[mealType]} report sent`); void qc.invalidateQueries({ queryKey: ['services'] }); void qc.invalidateQueries({ queryKey: ['service-status'] }); },
    onError: (e, v) => {
      if (!navigator.onLine || (isApiError(e) && e.status === 0)) {
        enqueue({ id: key, kind: 'meal-service', label: `${MEAL_LABEL[mealType]} at ${school.name}`, payload: { ...v, clientRef: key } });
        toast.info('No connection. The report is saved on this device and will be sent automatically.');
        setKey(newKey());
      } else setError((e as Error).message);
    },
  });
  const done = existing.data?.data[0];
  const e = form.formState.errors;
  if (done) {
    return (
      <Section title={MEAL_LABEL[mealType]} actions={<Badge tone="success">Reported</Badge>}>
        <DetailList items={[
          { label: 'Present', value: num(done.present) }, { label: 'Served', value: num(done.mealsServed) }, { label: 'Fed of present', value: pct(done.coveragePct) },
          { label: 'Leftover servings', value: num(done.leftoverServings) }, { label: 'Meal batch', value: done.batchNo }, { label: 'Reported by', value: done.reportedBy.name },
        ]} />
      </Section>
    );
  }
  return (
    <Section title={MEAL_LABEL[mealType]} description={prepared ? `Linked to batch ${prepared.batchNo}.` : 'No cooking batch recorded yet for today.'} actions={queued && <Badge tone="warning"><CloudOff /> Waiting to send</Badge>}>
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => { setError(undefined); m.mutate(v); })} noValidate>
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Children present" error={e.present} required><Input type="number" inputMode="numeric" {...form.register('present')} /></Field>
          <Field label="Meals available" error={e.mealsAvailable} required hint="Prepared or received"><Input type="number" inputMode="numeric" {...form.register('mealsAvailable')} /></Field>
          <Field label="Meals served" error={e.mealsServed} required><Input type="number" inputMode="numeric" {...form.register('mealsServed')} /></Field>
          <Field label="Leftover servings" error={e.leftoverServings}><Input type="number" inputMode="numeric" {...form.register('leftoverServings')} /></Field>
          <Field label="Food wasted (kg)" error={e.wastageKg}><Input type="number" step="0.1" inputMode="decimal" {...form.register('wastageKg')} /></Field>
          <FormSelect control={form.control} name="wastageReason" label="Wastage reason" options={WASTAGE_REASONS.map((r) => ({ value: r, label: humanize(r) }))} />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>Meal service was interrupted</span><Switch checked={interrupted} onCheckedChange={(v) => form.setValue('serviceInterrupted', v)} /></label>
        {interrupted && <Field label="What happened?" error={e.interruptionReason} required><Textarea rows={2} {...form.register('interruptionReason')} placeholder="e.g. LPG ran out; dry rations given" /></Field>}
        <Field label="Remarks" error={e.remarks}><Textarea rows={2} {...form.register('remarks')} /></Field>
        <div className="flex justify-end"><Button type="submit" loading={m.isPending}>Send report</Button></div>
      </form>
    </Section>
  );
}
