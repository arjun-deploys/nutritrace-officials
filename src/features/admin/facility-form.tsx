import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { FACILITY_TYPES, facilityCreateSchema, type FacilityCreateInput, type FacilityDto, type FacilityType } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FormError, FormSelect } from '@/components/shared/form';
import { FacilityPicker } from '@/components/shared/facility-picker';
import { registry } from '@/lib/api';
import { humanize } from '@/lib/format';
import { toast } from 'sonner';

/** Which hierarchy level each facility type sits at (index into hierarchyLevels; -1 = lowest). */
const LEVEL_FOR: Record<FacilityType, number[]> = { STATE_WAREHOUSE: [0], DISTRICT_WAREHOUSE: [1], BLOCK_STORE: [2], CENTRAL_KITCHEN: [1, 2], SCHOOL: [-1] };

type FormIn = z.input<typeof facilityCreateSchema>;
const EMPTY: FormIn = { code: '', name: '', type: 'SCHOOL', geoUnitId: '', address: '', inCharge: { name: '', phone: '' } };

export function FacilityDialog({ open, facility, onClose }: { open: boolean; facility?: FacilityDto; onClose: () => void }) {
  const qc = useQueryClient();
  const units = useQuery(registry.geoUnits());
  const tenant = useQuery(registry.tenant());
  const [error, setError] = useState<string>();
  const [active, setActive] = useState(true);
  const form = useForm<FormIn, unknown, FacilityCreateInput>({ resolver: zodResolver(facilityCreateSchema), defaultValues: EMPTY });
  const tenantRef = useRef(tenant.data?.config.programmes);
  tenantRef.current = tenant.data?.config.programmes;
  useEffect(() => {
    if (!open) return;
    setError(undefined);
    setActive(facility?.active ?? true);
    form.reset(facility ? {
      code: facility.code, name: facility.name, type: facility.type, geoUnitId: facility.geoUnitId, address: facility.address ?? '', location: facility.location,
      inCharge: { name: facility.inCharge?.name ?? '', phone: facility.inCharge?.phone ?? '' }, storageCapacityKg: facility.storageCapacityKg, school: facility.school,
    } : { ...EMPTY, school: { udiseCode: '', category: 'PRIMARY', enrolment: '' as unknown as number, hasKitchen: true, programmes: (tenantRef.current ?? []).map((p) => p.code) } });
  }, [open, facility, form]);
  const type = form.watch('type') as FacilityType;
  const hasKitchen = form.watch('school.hasKitchen');
  const levels = tenant.data?.config.hierarchyLevels.length ?? 3;
  const allowedLevels = LEVEL_FOR[type].map((l) => (l < 0 ? levels - 1 : l));
  const areaOptions = (units.data ?? []).filter((u) => allowedLevels.includes(u.level)).map((u) => ({ value: u.id, label: `${u.name} (${u.levelName}) · ${u.geoPath}` }));
  const programmes = tenant.data?.config.programmes ?? [];
  useEffect(() => {
    if (type === 'SCHOOL' && !form.getValues('school')) form.setValue('school', { udiseCode: '', category: 'PRIMARY', enrolment: '' as unknown as number, hasKitchen: true, programmes: programmes.map((p) => p.code) });
    if (type !== 'SCHOOL') form.setValue('school', undefined);
  }, [type, form, programmes]);
  const m = useMutation({
    mutationFn: (v: FacilityCreateInput) => (facility ? registry.updateFacility(facility.id, { ...v, active }) : registry.createFacility(v)),
    meta: { silent: true },
    onSuccess: (f) => { toast.success(`${f.name} ${facility ? 'updated' : 'added'}`); void qc.invalidateQueries({ queryKey: ['facilities'] }); void qc.invalidateQueries({ queryKey: ['facility', f.id] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{facility ? `Edit ${facility.name}` : 'Add facility'}</DialogTitle>
          <DialogDescription>Warehouses, stores, central kitchens and schools. A school's identity comes from its UDISE+ code.</DialogDescription>
        </DialogHeader>
        <form id="facility-form" className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => { setError(undefined); m.mutate(v); })} noValidate>
          <div className="sm:col-span-2"><FormError message={error} /></div>
          <FormSelect control={form.control} name="type" label="Type" required disabled={!!facility} options={FACILITY_TYPES.map((t) => ({ value: t, label: humanize(t) }))} />
          <Field label="Code" error={e.code} required hint="Unique in the state, e.g. TN-SCH-MDU-0421"><Input {...form.register('code')} disabled={!!facility} /></Field>
          <Field label="Name" error={e.name} required className="sm:col-span-2"><Input {...form.register('name')} placeholder={type === 'SCHOOL' ? 'e.g. PUPS Kottampatti' : 'e.g. Madurai District Warehouse'} /></Field>
          <FormSelect control={form.control} name="geoUnitId" label="Area" required className="sm:col-span-2" options={areaOptions} hint={type === 'SCHOOL' ? 'Schools belong to the lowest level (e.g. block).' : undefined} />
          <Field label="Address" error={e.address} className="sm:col-span-2"><Input {...form.register('address')} /></Field>
          <Field label="In-charge name"><Input {...form.register('inCharge.name')} /></Field>
          <Field label="In-charge phone"><Input inputMode="tel" {...form.register('inCharge.phone')} /></Field>
          <Field label="Latitude" hint="Optional; used on maps"><Input type="number" step="any" {...form.register('location.lat', { setValueAs: (v) => (v === '' || v === undefined ? undefined : Number(v)) })} /></Field>
          <Field label="Longitude"><Input type="number" step="any" {...form.register('location.lng', { setValueAs: (v) => (v === '' || v === undefined ? undefined : Number(v)) })} /></Field>
          {type !== 'SCHOOL' && <Field label="Storage capacity (kg)" error={e.storageCapacityKg}><Input type="number" {...form.register('storageCapacityKg')} /></Field>}
          {type === 'SCHOOL' && (
            <fieldset className="grid gap-3 rounded-md border p-3 sm:col-span-2 sm:grid-cols-3">
              <legend className="px-1 text-sm font-medium">School details</legend>
              <Field label="UDISE+ code" error={e.school?.udiseCode} required><Input inputMode="numeric" maxLength={11} {...form.register('school.udiseCode')} /></Field>
              <FormSelect control={form.control} name="school.category" label="Category" required options={[{ value: 'PRIMARY', label: 'Primary (I–V)' }, { value: 'UPPER_PRIMARY', label: 'Upper primary (VI–VIII)' }]} />
              <Field label="Enrolment" error={e.school?.enrolment} required><Input type="number" {...form.register('school.enrolment')} /></Field>
              <Controller control={form.control} name="school.hasKitchen" render={({ field }) => (
                <label className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-sm sm:col-span-3">Cooks on site (has its own kitchen)<Switch checked={!!field.value} onCheckedChange={field.onChange} /></label>
              )} />
              {hasKitchen === false && (
                <Controller control={form.control} name="school.servedByKitchenId" render={({ field }) => (
                  <Field label="Served by central kitchen" className="sm:col-span-3"><FacilityPicker value={field.value} onChange={field.onChange} types={['CENTRAL_KITCHEN']} /></Field>
                )} />
              )}
              <Controller control={form.control} name="school.programmes" render={({ field, fieldState }) => (
                <div className="space-y-1.5 sm:col-span-3">
                  <p className="text-sm">Programmes</p>
                  <div className="flex flex-wrap gap-4">
                    {programmes.map((p) => (
                      <label key={p.code} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={field.value?.includes(p.code)} onCheckedChange={(c) => field.onChange(c ? [...(field.value ?? []), p.code] : (field.value ?? []).filter((x: string) => x !== p.code))} />{p.name}
                      </label>
                    ))}
                  </div>
                  {fieldState.error && <p className="text-xs text-danger">Choose at least one programme</p>}
                </div>
              )} />
            </fieldset>
          )}
          {facility && <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm sm:col-span-2"><span>Active<span className="block text-xs text-muted-foreground">Inactive facilities keep their history but receive no new stock or reports.</span></span><Switch checked={active} onCheckedChange={setActive} /></label>}
        </form>
        <DialogFooter><Button type="submit" form="facility-form" loading={m.isPending}>{facility ? 'Save changes' : 'Add facility'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
