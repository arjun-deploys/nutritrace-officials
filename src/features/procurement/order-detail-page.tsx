import type { z } from 'zod';
import { useParams } from 'react-router';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { asnCreateSchema, type AsnCreateInput, type PoDto } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Page, PageHeader, Section, DetailList } from '@/components/shared/page';
import { QueryBoundary, LoadingBlock } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Timeline } from '@/components/shared/timeline';
import { LotLink } from '@/components/shared/links';
import { Field, FormSelect } from '@/components/shared/form';
import { procurement } from '@/lib/api';
import { date, dateTime, qty, num } from '@/lib/format';
import { statusOf } from '@/config/status';
import { useAuthStore, useCan } from '@/stores/auth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery(procurement.order(id));
  const me = useAuthStore((s) => s.user?.id);
  const canApprove = useCan('po:approve');
  const canAsn = useCan('asn:create');
  const decide = useMutation({
    mutationFn: (v: { decision: 'APPROVE' | 'REJECT'; comment?: string }) => procurement.decide(id, v),
    onSuccess: (po) => { toast.success(`${po.poNumber} ${statusOf('po', po.status).label.toLowerCase()}`); void qc.invalidateQueries({ queryKey: ['po', id] }); void qc.invalidateQueries({ queryKey: ['pos'] }); },
  });
  return (
    <QueryBoundary query={q} loading={<Page><LoadingBlock rows={8} /></Page>}>{(po) => (
      <Page>
        <PageHeader
          back={{ to: '/procurement/orders', label: 'Purchase orders' }}
          title={<span className="code-id">{po.poNumber}</span>}
          description={`${po.supplier.name} → ${po.deliverTo.name}`}
          meta={<StatusBadge kind="po" value={po.status} />}
          actions={<>
            {canApprove && po.status === 'PENDING_APPROVAL' && po.createdBy.userId !== me && (<>
              <ReasonDialog trigger={<Button variant="outline">Reject</Button>} title="Reject order" confirmLabel="Reject order" destructive onConfirm={(c) => decide.mutateAsync({ decision: 'REJECT', comment: c })} pending={decide.isPending} />
              <Button onClick={() => decide.mutate({ decision: 'APPROVE' })} loading={decide.isPending}>Approve</Button>
            </>)}
            {canApprove && po.status === 'PENDING_APPROVAL' && po.createdBy.userId === me && <p className="text-sm text-muted-foreground">Another officer must approve your order.</p>}
            {canAsn && ['APPROVED', 'PARTIALLY_FULFILLED'].includes(po.status) && <AsnDialog po={po} />}
          </>}
        />
        <Section title="Reconciliation" description="Quantities are recorded at each step and never assumed from the step before." bodyClassName="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50"><TableRow>
                {['Commodity', 'Ordered', 'Dispatched', 'Received', 'Accepted', 'Rejected', 'Outstanding'].map((h, i) => <TableHead key={h} className={cn('text-xs', i && 'text-right')}>{h}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {po.lines.map((l) => {
                  const out = Math.max(0, l.quantity - l.accepted);
                  return (
                    <TableRow key={l.commodityId}>
                      <TableCell className="font-medium">{l.commodityName}</TableCell>
                      <TableCell className="text-right num">{qty(l.quantity, l.unit)}</TableCell>
                      <TableCell className="text-right num">{qty(l.dispatched, l.unit)}</TableCell>
                      <TableCell className={cn('text-right num', l.received && l.received < l.dispatched && 'text-warning')}>{qty(l.received, l.unit)}</TableCell>
                      <TableCell className="text-right num">{qty(l.accepted, l.unit)}</TableCell>
                      <TableCell className={cn('text-right num', l.rejected > 0 && 'text-danger')}>{qty(l.rejected, l.unit)}</TableCell>
                      <TableCell className="text-right font-medium num">{qty(out, l.unit)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Section>
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Section title="Supplier dispatches" description="Each dispatch creates traceable lots with their own codes.">
            {po.asns.length === 0 ? <p className="text-sm text-muted-foreground">Nothing dispatched yet.</p> : (
              <ul className="space-y-4">
                {po.asns.map((a) => (
                  <li key={a.id} className="rounded-md border p-3">
                    <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="code-id">{a.asnNo}</span><span className="text-muted-foreground">{dateTime(a.dispatchedAt)} · {a.vehicleNo} · invoice {a.invoiceNo}</span></p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {a.lots.map((l) => <li key={l.lotId} className="flex items-center justify-between gap-3"><LotLink id={l.lotId} code={l.lotCode} /><span className="text-muted-foreground num">{qty(l.quantity, l.unit)} · supplier lot {l.supplierLotNo}</span></li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Order details">
            <DetailList columns={1} items={[
              { label: 'Programme', value: po.programmeCode },
              { label: 'Contract reference', value: po.contractRef },
              { label: 'Expected delivery', value: date(po.expectedDeliveryDate) },
              { label: 'Raised by', value: `${po.createdBy.name}, ${dateTime(po.createdAt)}` },
              { label: 'Notes', value: po.notes, hidden: !po.notes },
            ]} />
            <div className="mt-5 border-t pt-4"><Timeline items={[...po.history].reverse().map((h, i) => ({ key: String(i), title: statusOf('po', h.status).label, at: dateTime(h.at), meta: h.actor.name, body: h.comment }))} /></div>
          </Section>
        </div>
      </Page>
    )}</QueryBoundary>
  );
}

function AsnDialog({ po }: { po: PoDto }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const form = useForm<z.input<typeof asnCreateSchema>, unknown, AsnCreateInput>({
    resolver: zodResolver(asnCreateSchema),
    defaultValues: {
      poId: po.id, vehicleNo: '', driverName: '', driverPhone: '', invoiceNo: '',
      dispatchedAt: local(now), expectedArrivalAt: local(new Date(now.getTime() + 86_400_000)),
      lots: [{ commodityId: po.lines[0]?.commodityId ?? '', supplierLotNo: '', quantity: undefined as unknown as number, packedOn: '', expiresOn: '', originDistrict: '', originState: '', certificateNo: '' }],
    },
  });
  const lots = useFieldArray({ control: form.control, name: 'lots' });
  const m = useMutation({
    mutationFn: (v: AsnCreateInput) => procurement.createAsn({ ...v, dispatchedAt: new Date(v.dispatchedAt).toISOString(), expectedArrivalAt: new Date(v.expectedArrivalAt).toISOString() }),
    onSuccess: (a) => { toast.success(`${a.asnNo}: ${a.lots.length} lot(s) created`); setOpen(false); void qc.invalidateQueries(); },
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><PackagePlus /> Record supplier dispatch</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Supplier dispatch</DialogTitle><DialogDescription>Each lot line becomes a traceable lot with its own code and QR label.</DialogDescription></DialogHeader>
        <form id="asn" className="space-y-5" onSubmit={form.handleSubmit((v) => m.mutate(v))} noValidate>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Vehicle number" error={e.vehicleNo}><Input {...form.register('vehicleNo')} placeholder="TN09AB1234" className="uppercase" /></Field>
            <Field label="Driver name" error={e.driverName}><Input {...form.register('driverName')} /></Field>
            <Field label="Driver phone" error={e.driverPhone}><Input inputMode="tel" {...form.register('driverPhone')} /></Field>
            <Field label="Invoice number" error={e.invoiceNo}><Input {...form.register('invoiceNo')} /></Field>
            <Field label="Dispatched at" error={e.dispatchedAt}><Input type="datetime-local" {...form.register('dispatchedAt')} /></Field>
            <Field label="Expected arrival" error={e.expectedArrivalAt}><Input type="datetime-local" {...form.register('expectedArrivalAt')} /></Field>
          </div>
          {lots.fields.map((f, i) => (
            <fieldset key={f.id} className="space-y-3 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">Lot {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-4">
                <FormSelect control={form.control} name={`lots.${i}.commodityId`} label="Commodity" options={po.lines.map((l) => ({ value: l.commodityId, label: `${l.commodityName} (${num(l.quantity - l.dispatched)} left)` }))} className="sm:col-span-2" />
                <Field label="Supplier lot no." error={e.lots?.[i]?.supplierLotNo}><Input {...form.register(`lots.${i}.supplierLotNo`)} /></Field>
                <Field label="Quantity" error={e.lots?.[i]?.quantity}><Input type="number" step="any" {...form.register(`lots.${i}.quantity`)} /></Field>
                <Field label="Packed on" error={e.lots?.[i]?.packedOn}><Input type="date" {...form.register(`lots.${i}.packedOn`)} /></Field>
                <Field label="Expires on" error={e.lots?.[i]?.expiresOn}><Input type="date" {...form.register(`lots.${i}.expiresOn`)} /></Field>
                <Field label="Origin district" error={e.lots?.[i]?.originDistrict}><Input {...form.register(`lots.${i}.originDistrict`)} /></Field>
                <Field label="Origin state" error={e.lots?.[i]?.originState}><Input {...form.register(`lots.${i}.originState`)} /></Field>
                <Field label="Quality certificate no." className="sm:col-span-2" hint="Required for a complete trace record"><Input {...form.register(`lots.${i}.certificateNo`)} /></Field>
              </div>
              {lots.fields.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => lots.remove(i)}><Trash2 /> Remove lot</Button>}
            </fieldset>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => lots.append({ ...form.getValues(`lots.${lots.fields.length - 1}`), supplierLotNo: '', quantity: undefined as unknown as number })}><Plus /> Add another lot</Button>
        </form>
        <DialogFooter><Button type="submit" form="asn" loading={m.isPending}>Record dispatch</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
