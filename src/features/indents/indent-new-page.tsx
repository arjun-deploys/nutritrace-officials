import { useNavigate } from 'react-router';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { indentCreateSchema, type IndentCreateInput } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { Field, FormSelect } from '@/components/shared/form';
import { FacilityPicker } from '@/components/shared/facility-picker';
import { indents, registry } from '@/lib/api';
import { unit } from '@/lib/format';
import { useUser } from '@/stores/auth';
import { toast } from 'sonner';

const REASONS = [['ROUTINE', 'Routine replenishment'], ['SHORTFALL', 'Stock running short'], ['RECALL_REPLACEMENT', 'Replacement after a recall'], ['ENROLMENT_INCREASE', 'More children enrolled'], ['OTHER', 'Other']];

export default function IndentNewPage() {
  const user = useUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const commodities = useQuery(registry.commodities());
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('en-CA');
  const form = useForm<z.input<typeof indentCreateSchema>, unknown, IndentCreateInput>({
    resolver: zodResolver(indentCreateSchema),
    defaultValues: { requestingFacilityId: user.facilityId ?? '', supplyingFacilityId: '', neededBy: inDays(3), reason: 'ROUTINE', notes: '', lines: [{ commodityId: '', quantity: '' as unknown as number }] },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const m = useMutation({ mutationFn: indents.create, onSuccess: (i) => { toast.success(`${i.indentNo} sent to ${i.supplying.name}`); void qc.invalidateQueries({ queryKey: ['indents'] }); navigate(`/indents/${i.id}`); } });
  const e = form.formState.errors;
  return (
    <Page className="max-w-3xl">
      <PageHeader back={{ to: '/indents', label: 'Indents' }} title="Raise an indent" description="Ask the store above you for stock. They approve the quantities and send a shipment; you confirm what arrives." />
      <form className="space-y-6" onSubmit={form.handleSubmit((v) => m.mutate(v))} noValidate>
        <Section title="Who and when">
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller control={form.control} name="requestingFacilityId" render={({ field, fieldState }) => (
              <Field label="Stock needed at" required error={fieldState.error}>{user.facilityId ? <Input value={user.facilityName ?? ''} disabled /> : <FacilityPicker value={field.value} onChange={field.onChange} />}</Field>
            )} />
            <Controller control={form.control} name="supplyingFacilityId" render={({ field, fieldState }) => (
              <Field label="Ask" required error={fieldState.error} hint="Usually your district warehouse"><FacilityPicker value={field.value} onChange={field.onChange} types={['DISTRICT_WAREHOUSE', 'BLOCK_STORE', 'STATE_WAREHOUSE', 'CENTRAL_KITCHEN']} /></Field>
            )} />
            <Field label="Needed by" required error={e.neededBy}><Input type="date" min={inDays(0)} {...form.register('neededBy')} /></Field>
            <FormSelect control={form.control} name="reason" label="Why" options={REASONS.map(([value, label]) => ({ value: value!, label: label! }))} />
          </div>
        </Section>
        <Section title="Products" actions={<Button type="button" variant="outline" size="sm" onClick={() => lines.append({ commodityId: '', quantity: '' as unknown as number })}><Plus /> Add product</Button>}>
          <div className="space-y-3">
            {lines.fields.map((f, i) => {
              const c = commodities.data?.find((x) => x.id === form.watch(`lines.${i}.commodityId`));
              return (
                <div key={f.id} className="grid items-start gap-3 sm:grid-cols-[2fr_1fr_auto]">
                  <FormSelect control={form.control} name={`lines.${i}.commodityId`} label="Product" options={(commodities.data ?? []).filter((x) => x.active).map((x) => ({ value: x.id, label: x.name }))} />
                  <Field label={`Quantity${c ? ` (${unit(c.unit)})` : ''}`} error={e.lines?.[i]?.quantity}><Input type="number" inputMode="decimal" step="any" {...form.register(`lines.${i}.quantity`)} /></Field>
                  <Button type="button" variant="ghost" size="icon" className="mt-6" disabled={lines.fields.length === 1} onClick={() => lines.remove(i)} aria-label="Remove product"><Trash2 /></Button>
                </div>
              );
            })}
          </div>
        </Section>
        <Section title="Note for the store"><Textarea rows={2} {...form.register('notes')} placeholder="Anything the store should know" /></Section>
        <div className="flex justify-end"><Button type="submit" size="lg" loading={m.isPending}>Send indent</Button></div>
      </form>
    </Page>
  );
}
