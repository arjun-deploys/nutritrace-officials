import type { z } from 'zod';
import { useNavigate } from 'react-router';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { poCreateSchema, type PoCreateInput } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { Field, FormSelect } from '@/components/shared/form';
import { FacilityPicker } from '@/components/shared/facility-picker';
import { procurement, registry } from '@/lib/api';
import { unit } from '@/lib/format';
import { toast } from 'sonner';

export default function OrderNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const suppliers = useQuery(registry.suppliers({ status: 'APPROVED', pageSize: 200 }));
  const commodities = useQuery(registry.commodities());
  const tenant = useQuery(registry.tenant());
  const form = useForm<z.input<typeof poCreateSchema>, unknown, PoCreateInput>({
    resolver: zodResolver(poCreateSchema),
    defaultValues: { supplierId: '', deliverToFacilityId: '', programmeCode: '', contractRef: '', expectedDeliveryDate: '', notes: '', lines: [{ commodityId: '', quantity: undefined as unknown as number }] },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const supplierId = form.watch('supplierId');
  const supplier = suppliers.data?.data.find((s) => s.id === supplierId);
  const allowed = (commodities.data ?? []).filter((c) => !supplier || supplier.commodityIds.includes(c.id));
  const create = useMutation({
    mutationFn: (v: PoCreateInput & { submit: boolean }) => procurement.createOrder(v),
    onSuccess: (po) => { toast.success(`${po.poNumber} ${po.status === 'DRAFT' ? 'saved as draft' : 'sent for approval'}`); void qc.invalidateQueries({ queryKey: ['pos'] }); navigate(`/procurement/orders/${po.id}`); },
  });
  const submit = (asDraft: boolean) => form.handleSubmit((v) => create.mutate({ ...v, submit: !asDraft }));
  const { errors } = form.formState;

  return (
    <Page className="max-w-4xl">
      <PageHeader back={{ to: '/procurement/orders', label: 'Purchase orders' }} title="New purchase order" description="A different officer must approve the order before the supplier can dispatch." />
      <form className="space-y-6" onSubmit={submit(false)} noValidate>
        <Section title="Supplier and delivery">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect control={form.control} name="supplierId" label="Supplier" required options={(suppliers.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))} hint="Only approved suppliers with a valid FSSAI licence are listed." />
            <Controller control={form.control} name="deliverToFacilityId" render={({ field, fieldState }) => (
              <Field label="Deliver to" required error={fieldState.error}>
                <FacilityPicker value={field.value} onChange={field.onChange} types={['STATE_WAREHOUSE', 'DISTRICT_WAREHOUSE', 'BLOCK_STORE', 'CENTRAL_KITCHEN']} invalid={!!fieldState.error} />
              </Field>
            )} />
            <FormSelect control={form.control} name="programmeCode" label="Programme" required options={(tenant.data?.config.programmes ?? []).map((p) => ({ value: p.code, label: p.name }))} />
            <Field label="Expected delivery" required error={errors.expectedDeliveryDate}><Input type="date" {...form.register('expectedDeliveryDate')} /></Field>
            <Field label="Contract or tender reference" error={errors.contractRef}><Input {...form.register('contractRef')} placeholder="e.g. TNCSC/TDR/2026/114" /></Field>
          </div>
        </Section>
        <Section title="Commodities" actions={<Button type="button" variant="outline" size="sm" onClick={() => lines.append({ commodityId: '', quantity: undefined as unknown as number })}><Plus /> Add line</Button>}>
          {errors.lines?.root?.message && <p className="mb-3 text-sm text-danger">{errors.lines.root.message}</p>}
          <div className="space-y-3">
            {lines.fields.map((f, i) => {
              const c = commodities.data?.find((x) => x.id === form.watch(`lines.${i}.commodityId`));
              return (
                <div key={f.id} className="grid items-start gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <FormSelect control={form.control} name={`lines.${i}.commodityId`} label="Commodity" options={allowed.map((x) => ({ value: x.id, label: x.name }))} placeholder={supplier ? 'Choose' : 'Choose a supplier first'} disabled={!supplier} />
                  <Field label={`Quantity${c ? ` (${unit(c.unit)})` : ''}`} error={errors.lines?.[i]?.quantity}><Input type="number" inputMode="decimal" step="any" {...form.register(`lines.${i}.quantity`)} /></Field>
                  <Field label="Rate per unit (₹)" error={errors.lines?.[i]?.ratePerUnit}><Input type="number" inputMode="decimal" step="any" {...form.register(`lines.${i}.ratePerUnit`)} /></Field>
                  <Button type="button" variant="ghost" size="icon" className="mt-6" disabled={lines.fields.length === 1} onClick={() => lines.remove(i)} aria-label={`Remove line ${i + 1}`}><Trash2 /></Button>
                </div>
              );
            })}
          </div>
        </Section>
        <Section title="Notes"><Textarea rows={3} {...form.register('notes')} placeholder="Packing, labelling or delivery-window instructions for the supplier" /></Section>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={submit(true)} disabled={create.isPending}>Save as draft</Button>
          <Button type="submit" loading={create.isPending}>Send for approval</Button>
        </div>
      </form>
    </Page>
  );
}
