import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { vehicleCreateSchema, type VehicleCreateInput, type VehicleDto } from '@nt/domain';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { Field, FormError } from '@/components/shared/form';
import { registry } from '@/lib/api';
import { num } from '@/lib/format';
import { useCan } from '@/stores/auth';
import { toast } from 'sonner';
import { ExchangeActions } from '@/admin/components/exchange';

export default function VehiclesPage() {
  const q = useQuery(registry.vehicles());
  const qc = useQueryClient();
  const canManage = useCan('shipment:create');
  const [open, setOpen] = useState(false);
  const retire = useMutation({ mutationFn: (v: VehicleDto) => registry.updateVehicle(v.id, { active: false }), onSuccess: () => { toast.success('Vehicle retired'); void qc.invalidateQueries({ queryKey: ['vehicles'] }); } });
  const columns: ColumnDef<VehicleDto, unknown>[] = [
    { header: 'Vehicle', cell: ({ row }) => <span className="code-id">{row.original.registrationNo}</span> },
    { header: 'Transporter', cell: ({ row }) => row.original.transporterName },
    { header: 'Driver', cell: ({ row }) => `${row.original.driver.name} · ${row.original.driver.phone}` },
    { header: 'Capacity', cell: ({ row }) => `${num(row.original.capacityKg / 1000)} t`, meta: { align: 'right' } },
    { header: 'GPS device', cell: ({ row }) => row.original.gpsDeviceId ?? <span className="text-muted-foreground">None</span> },
    ...(canManage ? [{ id: 'r', header: '', cell: ({ row }) => <Button size="sm" variant="ghost" onClick={() => retire.mutate(row.original)}>Retire</Button> } as ColumnDef<VehicleDto, unknown>] : []),
  ];
  return (
    <Page>
      <PageHeader title="Vehicles" description="Trucks used for deliveries. A linked GPS device lets the platform show last-known location for each shipment." actions={<><ExchangeActions entity="vehicles" invalidate={['vehicles']} />{canManage && <Button onClick={() => setOpen(true)}><Plus /> Add vehicle</Button>}</>} />
      <DataTable columns={columns} rows={q.data} loading={q.isPending} getRowId={(v) => v.id} empty={{ title: 'No vehicles yet' }} />
      <VehicleDialog open={open} onClose={() => setOpen(false)} />
    </Page>
  );
}

function VehicleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string>();
  const form = useForm<z.input<typeof vehicleCreateSchema>, unknown, VehicleCreateInput>({ resolver: zodResolver(vehicleCreateSchema), defaultValues: { registrationNo: '', transporterName: '', capacityKg: 9000, gpsDeviceId: '', driver: { name: '', phone: '' } } });
  const m = useMutation({
    mutationFn: registry.createVehicle, meta: { silent: true },
    onSuccess: (v) => { toast.success(`${v.registrationNo} added`); void qc.invalidateQueries({ queryKey: ['vehicles'] }); form.reset(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add vehicle</DialogTitle><DialogDescription>Registration format: TN09AB1234.</DialogDescription></DialogHeader>
        <form id="vehicle-form" className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => { setError(undefined); m.mutate(v); })} noValidate>
          <div className="sm:col-span-2"><FormError message={error} /></div>
          <Field label="Registration number" error={e.registrationNo} required><Input {...form.register('registrationNo')} className="uppercase" /></Field>
          <Field label="Capacity (kg)" error={e.capacityKg} required><Input type="number" {...form.register('capacityKg')} /></Field>
          <Field label="Transporter" error={e.transporterName} required className="sm:col-span-2"><Input {...form.register('transporterName')} /></Field>
          <Field label="Driver name" error={e.driver?.name} required><Input {...form.register('driver.name')} /></Field>
          <Field label="Driver phone" error={e.driver?.phone} required><Input inputMode="tel" {...form.register('driver.phone')} /></Field>
          <Field label="GPS device ID" hint="Optional" className="sm:col-span-2"><Input {...form.register('gpsDeviceId')} /></Field>
        </form>
        <DialogFooter><Button type="submit" form="vehicle-form" loading={m.isPending}>Add vehicle</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
