import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigation, PackageCheck, Truck } from 'lucide-react';
import { OPEN_SHIPMENT_STATUSES, type ShipmentDto } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Page, PageHeader, Section, DetailList } from '@/components/shared/page';
import { QueryBoundary, LoadingBlock } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { LotLink } from '@/components/shared/links';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Timeline } from '@/components/shared/timeline';
import { logistics } from '@/lib/api';
import { ago, dateTime, num, qty } from '@/lib/format';
import { statusOf } from '@/config/status';
import { useCan, useUser } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const RouteMap = lazy(() => import('./route-map'));

export default function ShipmentDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery(logistics.shipment(id));
  const qc = useQueryClient();
  const user = useUser();
  const canUpdate = useCan('shipment:update');
  const canReceive = useCan('shipment:receive');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['shipment', id] }); void qc.invalidateQueries({ queryKey: ['shipments'] }); };
  const milestone = useMutation({ mutationFn: (status: string) => logistics.milestone(id, { status }), onSuccess: (s) => { toast.success(statusOf('shipment', s.status).label); refresh(); } });
  const cancel = useMutation({ mutationFn: (reason: string) => logistics.cancel(id, reason), onSuccess: () => { toast.success('Shipment cancelled; stock released'); refresh(); } });

  return (
    <QueryBoundary query={q} loading={<Page><LoadingBlock rows={8} /></Page>}>{(s) => {
      const open = OPEN_SHIPMENT_STATUSES.includes(s.status);
      const isReceiver = !user.facilityId || user.facilityId === s.to.id;
      return (
        <Page>
          <PageHeader back={{ to: '/logistics/shipments', label: 'Shipments' }} title={<span className="code-id">{s.shipmentNo}</span>}
            description={`${s.from.name} → ${s.to.name}`}
            meta={<><StatusBadge kind="shipment" value={s.status} />{s.delayHours > 0 && open && <span className="text-sm text-danger num">{num(s.delayHours)} h past expected arrival</span>}</>}
            actions={<>
              {canUpdate && s.status === 'PLANNED' && <ReasonDialog trigger={<Button variant="outline">Cancel</Button>} title="Cancel shipment" description="Reserved stock is returned to the origin." confirmLabel="Cancel shipment" destructive onConfirm={(r) => cancel.mutateAsync(r)} />}
              {canUpdate && s.status === 'PLANNED' && <DispatchDialog shipment={s} onDone={refresh} />}
              {canUpdate && ['DISPATCHED', 'DELAYED'].includes(s.status) && <Button variant="outline" onClick={() => milestone.mutate('IN_TRANSIT')} loading={milestone.isPending}><Navigation /> Mark in transit</Button>}
              {canUpdate && ['DISPATCHED', 'IN_TRANSIT', 'DELAYED'].includes(s.status) && <Button variant="outline" onClick={() => milestone.mutate('ARRIVED')} loading={milestone.isPending}>Mark arrived</Button>}
              {canReceive && isReceiver && ['DISPATCHED', 'IN_TRANSIT', 'DELAYED', 'ARRIVED'].includes(s.status) && <Button asChild><Link to={`/logistics/shipments/${s.id}/receive`}><PackageCheck /> Receive goods</Link></Button>}
            </>}
          />
          <Section title="Load and receipt" description="Dispatched and received quantities are recorded independently." bodyClassName="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50"><TableRow>{['Lot', 'Commodity', 'Dispatched', 'Received', 'Accepted', 'Rejected'].map((h, i) => <TableHead key={h} className={cn('text-xs', i > 1 && 'text-right')}>{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {s.lines.map((l) => (
                    <TableRow key={l.lotId}>
                      <TableCell><LotLink id={l.lotId} code={l.lotCode} /></TableCell>
                      <TableCell>{l.commodityName}</TableCell>
                      <TableCell className="text-right num">{qty(l.dispatchedQty, l.unit)}</TableCell>
                      <TableCell className={cn('text-right num', l.receivedQty !== undefined && l.receivedQty < l.dispatchedQty && 'font-medium text-warning')}>{l.receivedQty === undefined ? '—' : qty(l.receivedQty, l.unit)}</TableCell>
                      <TableCell className="text-right num">{l.acceptedQty === undefined ? '—' : qty(l.acceptedQty, l.unit)}</TableCell>
                      <TableCell className={cn('text-right num', (l.rejectedQty ?? 0) > 0 && 'text-danger')}>{l.rejectedQty === undefined ? '—' : qty(l.rejectedQty, l.unit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Section title="Movement" description={s.lastLocation ? `Last ${s.lastLocation.source === 'GPS' ? 'GPS fix' : 'reported position'} ${ago(s.lastLocation.at)}. Location is indicative; receipt confirms delivery.` : 'No location reported for this shipment.'}>
              {s.lastLocation && <Suspense fallback={<LoadingBlock rows={2} />}><div className="mb-5"><RouteMap route={s.route ?? []} last={s.lastLocation} /></div></Suspense>}
              <Timeline items={[...s.milestones].reverse().map((m, i) => ({ key: String(i), title: statusOf('shipment', m.status).label, at: dateTime(m.at), meta: m.actor?.name, body: m.note, color: m.status === 'DELAYED' ? 'var(--danger)' : m.status.includes('RECEIVED') ? 'var(--success)' : 'var(--info)' }))} />
            </Section>
            <Section title="Details">
              <DetailList columns={1} items={[
                { label: 'Purchase order', value: s.poId ? <Link className="text-primary hover:underline" to={`/procurement/orders/${s.poId}`}>{s.poNumber}</Link> : undefined, hidden: !s.poId },
                { label: 'Vehicle', value: s.vehicle ? <><Truck className="mr-1 inline size-4" />{s.vehicle.registrationNo} · {s.vehicle.driverName}, {s.vehicle.driverPhone}</> : 'Not assigned' },
                { label: 'Planned dispatch', value: dateTime(s.plannedDispatchAt) },
                { label: 'Dispatched', value: dateTime(s.dispatchedAt) },
                { label: 'Expected arrival', value: dateTime(s.expectedArrivalAt) },
                { label: 'Received', value: s.receivedAt ? dateTime(s.receivedAt) : 'Awaiting receipt' },
              ]} />
            </Section>
          </div>
        </Page>
      );
    }}</QueryBoundary>
  );
}

function DispatchDialog({ shipment, onDone }: { shipment: ShipmentDto; onDone: () => void }) {
  const [v, setV] = useState({ vehicleNo: '', driverName: '', driverPhone: '', sealNo: '' });
  const [open, setOpen] = useState(false);
  const m = useMutation({ mutationFn: () => logistics.dispatch(shipment.id, v), onSuccess: () => { toast.success(`${shipment.shipmentNo} dispatched`); setOpen(false); onDone(); } });
  const ok = v.vehicleNo.length >= 6 && v.driverName.length >= 2 && v.driverPhone.length >= 10;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Truck /> Dispatch</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Dispatch {shipment.shipmentNo}</DialogTitle><DialogDescription>Stock leaves {shipment.from.name} and a custody hand-off is recorded for every lot.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {([['vehicleNo', 'Vehicle number'], ['driverName', 'Driver name'], ['driverPhone', 'Driver phone'], ['sealNo', 'Seal number (optional)']] as const).map(([k, l]) => (
            <div key={k} className="space-y-1.5"><Label htmlFor={k}>{l}</Label><Input id={k} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: k === 'vehicleNo' ? e.target.value.toUpperCase() : e.target.value }))} /></div>
          ))}
        </div>
        <DialogFooter><Button disabled={!ok} loading={m.isPending} onClick={() => m.mutate()}>Confirm dispatch</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
