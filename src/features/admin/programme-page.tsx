import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { tenantConfigSchema, type TenantConfig } from '@nt/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Page, PageHeader, Section, DetailList } from '@/components/shared/page';
import { Field } from '@/components/shared/form';
import { QueryBoundary } from '@/components/shared/states';
import { registry } from '@/lib/api';
import { MEAL_LABEL } from '@/config/status';
import { toast } from 'sonner';

const THRESHOLDS: { key: keyof TenantConfig['thresholds']; label: string; hint: string }[] = [
  { key: 'lowStockDaysOfCover', label: 'Low stock alert (days of cover)', hint: 'Raise an exception when usable stock covers fewer days than this.' },
  { key: 'expiryWarningDays', label: 'Expiry warning (days)', hint: 'Flag lots expiring within this many days.' },
  { key: 'receiptVarianceTolerancePct', label: 'Receipt variance tolerance (%)', hint: 'Short receipts beyond this open a discrepancy case.' },
  { key: 'wastageTolerancePct', label: 'Leftover tolerance (%)', hint: 'Leftover meals above this share are flagged.' },
  { key: 'shipmentDelayGraceHours', label: 'Delivery grace period (hours)', hint: 'How late a shipment may be before it is marked delayed.' },
  { key: 'schoolReportCutoffHour', label: 'School report cut-off (hour, 24h)', hint: 'Reports after this hour are marked late; missing ones are flagged.' },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ProgrammePage() {
  const tenant = useQuery(registry.tenant());
  const qc = useQueryClient();
  const form = useForm<TenantConfig>({ resolver: zodResolver(tenantConfigSchema) });
  useEffect(() => { if (tenant.data) form.reset(tenant.data.config); }, [tenant.data, form]);
  const m = useMutation({ mutationFn: registry.updateConfig, onSuccess: () => { toast.success('Programme settings saved'); void qc.invalidateQueries({ queryKey: ['tenant'] }); } });
  return (
    <QueryBoundary query={tenant}>{(t) => (
      <Page className="max-w-4xl">
        <PageHeader title="Programme settings" description={`Configuration for ${t.name}. Every state runs the same platform with its own hierarchy, languages, programmes and tolerances.`} />
        <Section title="Structure" description="Set during onboarding from the state preset; changes need a data migration and are made by StaTwig support.">
          <DetailList items={[
            { label: 'Administrative hierarchy', value: t.config.hierarchyLevels.join(' › ') },
            { label: 'Languages', value: t.config.languages.join(', ').toUpperCase() },
            { label: 'Programmes', value: <div className="flex flex-wrap gap-1.5">{t.config.programmes.map((p) => <Badge key={p.code} tone="outline">{p.name} · {p.mealTypes.map((m) => MEAL_LABEL[m]).join(', ')}</Badge>)}</div> },
            { label: 'Operating days', value: t.config.operatingDays.map((d) => DAYS[d]).join(', ') },
          ]} />
        </Section>
        <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-6" noValidate>
          <Section title="Alert thresholds" description="Agree these with the programme authority after baseline measurement. Changes are audited.">
            <div className="grid gap-4 sm:grid-cols-2">
              {THRESHOLDS.map((th) => (
                <Field key={th.key} label={th.label} hint={th.hint} error={form.formState.errors.thresholds?.[th.key]}>
                  <Input type="number" step="any" {...form.register(`thresholds.${th.key}`, { valueAsNumber: true })} />
                </Field>
              ))}
            </div>
          </Section>
          <Section title="Nutrition norms per meal" description="Energy and protein per child per meal. Lunch defaults follow PM POSHAN; breakfast and snack norms must be confirmed by the state.">
            <div className="grid gap-3">
              {t.config.nutritionNorms.map((n, i) => (
                <div key={`${n.schoolCategory}-${n.mealType}`} className="grid items-end gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
                  <p className="pb-2 text-sm">{MEAL_LABEL[n.mealType]} · {n.schoolCategory === 'PRIMARY' ? 'Primary' : 'Upper primary'}</p>
                  <Field label="Energy (kcal)"><Input type="number" {...form.register(`nutritionNorms.${i}.energyKcal`, { valueAsNumber: true })} /></Field>
                  <Field label="Protein (g)"><Input type="number" step="0.1" {...form.register(`nutritionNorms.${i}.proteinG`, { valueAsNumber: true })} /></Field>
                </div>
              ))}
            </div>
          </Section>
          <div className="flex justify-end"><Button type="submit" loading={m.isPending} disabled={!form.formState.isDirty}>Save settings</Button></div>
        </form>
      </Page>
    )}</QueryBoundary>
  );
}
