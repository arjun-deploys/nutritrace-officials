import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supplierCreateSchema, type SupplierCreateInput, type SupplierDto } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FormError } from '@/components/shared/form';
import { registry } from '@/lib/api';
import { toast } from 'sonner';

const EMPTY: SupplierCreateInput = { code: '', name: '', gstin: '', fssaiLicence: '', fssaiValidUntil: '', commodityIds: [], contact: { name: '', phone: '', email: '' }, address: '' };

/** New suppliers start as "pending verification"; a state officer approves them on the supplier page. */
export function SupplierDialog({ open, supplier, onClose }: { open: boolean; supplier?: SupplierDto; onClose: () => void }) {
  const qc = useQueryClient();
  const commodities = useQuery(registry.commodities());
  const [error, setError] = useState<string>();
  const form = useForm<SupplierCreateInput>({ resolver: zodResolver(supplierCreateSchema), defaultValues: EMPTY });
  useEffect(() => {
    if (open) { setError(undefined); form.reset(supplier ? { code: supplier.code, name: supplier.name, gstin: supplier.gstin, fssaiLicence: supplier.fssaiLicence, fssaiValidUntil: supplier.fssaiValidUntil, commodityIds: supplier.commodityIds, contact: { ...supplier.contact, email: supplier.contact.email ?? '' }, address: supplier.address } : EMPTY); }
  }, [open, supplier, form]);
  const m = useMutation({
    mutationFn: (v: SupplierCreateInput) => (supplier ? registry.updateSupplier(supplier.id, { ...v, code: undefined } as Partial<SupplierCreateInput>) : registry.createSupplier(v)),
    meta: { silent: true },
    onSuccess: (s) => { toast.success(supplier ? `${s.name} updated` : `${s.name} registered — awaiting verification`); void qc.invalidateQueries({ queryKey: ['suppliers'] }); void qc.invalidateQueries({ queryKey: ['supplier', s.id] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{supplier ? `Edit ${supplier.name}` : 'Register supplier'}</DialogTitle><DialogDescription>GSTIN and FSSAI licence are checked. Orders can only be raised once the supplier is approved.</DialogDescription></DialogHeader>
        <form id="supplier-form" className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => { setError(undefined); m.mutate(v); })} noValidate>
          <div className="sm:col-span-2"><FormError message={error} /></div>
          <Field label="Supplier name" error={e.name} required className="sm:col-span-2"><Input {...form.register('name')} /></Field>
          <Field label="Code" error={e.code} required hint="e.g. SUP-KON"><Input {...form.register('code')} disabled={!!supplier} /></Field>
          <Field label="GSTIN" error={e.gstin} required><Input {...form.register('gstin')} className="uppercase" maxLength={15} /></Field>
          <Field label="FSSAI licence number" error={e.fssaiLicence} required><Input inputMode="numeric" maxLength={14} {...form.register('fssaiLicence')} /></Field>
          <Field label="FSSAI licence valid until" error={e.fssaiValidUntil} required><Input type="date" {...form.register('fssaiValidUntil')} /></Field>
          <Field label="Contact person" error={e.contact?.name} required><Input {...form.register('contact.name')} /></Field>
          <Field label="Contact phone" error={e.contact?.phone} required><Input inputMode="tel" {...form.register('contact.phone')} /></Field>
          <Field label="Email" error={e.contact?.email} className="sm:col-span-2"><Input type="email" {...form.register('contact.email')} /></Field>
          <Field label="Address" error={e.address} className="sm:col-span-2"><Textarea rows={2} {...form.register('address')} /></Field>
          <Controller control={form.control} name="commodityIds" render={({ field, fieldState }) => (
            <fieldset className="space-y-2 rounded-md border p-3 sm:col-span-2">
              <legend className="px-1 text-sm font-medium">Approved to supply</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(commodities.data ?? []).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm"><Checkbox checked={field.value.includes(c.id)} onCheckedChange={(on) => field.onChange(on ? [...field.value, c.id] : field.value.filter((x) => x !== c.id))} />{c.name}</label>
                ))}
              </div>
              {fieldState.error && <p className="text-xs text-danger">{fieldState.error.message}</p>}
            </fieldset>
          )} />
        </form>
        <DialogFooter><Button type="submit" form="supplier-form" loading={m.isPending}>{supplier ? 'Save changes' : 'Register supplier'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
