import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { LastMileBoardDto, TripDto } from '@nt/domain';
import { Route as RouteIcon, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { LoadingBlock } from '@/components/shared/states';
import { useTableParams } from '@/hooks/use-table-params';
import { registry, trips } from '@/lib/api';
import { dateTime, time, today } from '@/lib/format';
import { useCan } from '@/stores/auth';
import { toast } from 'sonner';

type Stop = LastMileBoardDto['stops'][number];

/** Last mile: every school delivery today, trip by trip, until the school confirms receipt. */
export default function LastMilePage() {
  const [day, setDay] = useState(today());
  const board = useQuery(trips.board(day));
  const navigate = useNavigate();
  const canPlan = useCan('trip:manage');
  const [selected, setSelected] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);
  const b = board.data;
  const stopCols: ColumnDef<Stop, unknown>[] = [
    { header: 'Trip', cell: ({ row }) => <Link to={`/last-mile/trips/${row.original.tripId}`} className="code-id text-primary hover:underline">{row.original.tripNo}</Link> },
    { header: 'Stop', cell: ({ row }) => <span className="num">{row.original.seq}</span> },
    { header: 'School', cell: ({ row }) => <div className="max-w-64"><p className="truncate font-medium">{row.original.facility.name}</p><p className="truncate text-xs text-muted-foreground">{row.original.lineSummary}</p></div> },
    { header: 'Vehicle · driver', cell: ({ row }) => <span className="text-sm">{row.original.vehicleNo} · {row.original.driverName}</span> },
    { header: 'Arrived', cell: ({ row }) => time(row.original.arrivedAt) },
    { header: 'Handed to', cell: ({ row }) => (row.original.pod?.receivedBy ? <span className="text-sm">{row.original.pod.receivedBy}{row.original.pod.grnNo && <span className="block text-xs text-success">Receipt {row.original.pod.grnNo}{row.original.pod.hasDiscrepancy ? ' · discrepancy' : ''}</span>}</span> : row.original.failure ? <span className="text-sm text-danger">{row.original.failure.reason.toLowerCase().replaceAll('_', ' ')}</span> : '—') },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="stop" value={row.original.status} /> },
  ];
  return (
    <Page>
      <PageHeader title="Last mile" description="Deliveries from district stores to schools. A stop is delivered when the school takes the goods; quantities are confirmed by the school's own receipt."
        actions={<label className="flex items-center gap-2 text-sm text-muted-foreground">Day<Input type="date" value={day} onChange={(e) => setDay(e.target.value || today())} className="w-40" /></label>} />
      {board.isPending || !b ? <LoadingBlock rows={6} /> : (
        <>
          <KpiStrip kpis={[
            { key: 'stops', label: 'School stops', value: b.totals.stops },
            { key: 'del', label: 'Delivered', value: b.totals.delivered, hint: b.totals.stops ? `${Math.round((b.totals.delivered / b.totals.stops) * 100)}% of stops` : undefined },
            { key: 'pend', label: 'Still to reach', value: b.totals.pending, higherIsBetter: false },
            { key: 'fail', label: 'Failed', value: b.totals.failed, higherIsBetter: false },
            { key: 'trips', label: 'Trips on the road', value: b.totals.tripsActive, hint: `${b.totals.trips} trips today` },
            { key: 'wait', label: 'Deliveries without a trip', value: b.totals.awaitingTrip, higherIsBetter: false },
          ]} />
          <Tabs defaultValue="stops">
            <TabsList><TabsTrigger value="stops">Today's stops</TabsTrigger><TabsTrigger value="waiting">Waiting for a trip ({b.awaitingTrip.length})</TabsTrigger><TabsTrigger value="trips">All trips</TabsTrigger></TabsList>
            <TabsContent value="stops" className="mt-4">
              <DataTable columns={stopCols} rows={b.stops} getRowId={(s) => `${s.tripId}-${s.seq}`} onRowClick={(s) => navigate(`/last-mile/trips/${s.tripId}`)} empty={{ title: 'No trips today', description: 'Group planned school deliveries into a trip from the next tab.' }} rowClassName={(s) => (s.status === 'FAILED' ? 'bg-danger-soft/30' : undefined)} />
            </TabsContent>
            <TabsContent value="waiting" className="mt-4 space-y-3">
              {canPlan && <div className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-4 py-2 text-sm"><span>Select planned deliveries from the same store, in the order the truck will visit them.</span><Button size="sm" disabled={!selected.length} onClick={() => setPlanning(true)}><RouteIcon /> Plan trip ({selected.length})</Button></div>}
              <Section bodyClassName="p-0">
                <ul className="divide-y">
                  {b.awaitingTrip.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">Every school delivery is on a trip.</li>}
                  {b.awaitingTrip.map((w) => {
                    const pickable = canPlan && w.status === 'PLANNED' && (!selected.length || b.awaitingTrip.find((x) => x.shipmentId === selected[0])?.from.id === w.from.id);
                    return (
                      <li key={w.shipmentId} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        {canPlan && <Checkbox disabled={!pickable && !selected.includes(w.shipmentId)} checked={selected.includes(w.shipmentId)} onCheckedChange={(c) => setSelected((s) => (c ? [...s, w.shipmentId] : s.filter((x) => x !== w.shipmentId)))} aria-label={`Add ${w.shipmentNo} to trip`} />}
                        {selected.includes(w.shipmentId) && <Badge tone="trace">{selected.indexOf(w.shipmentId) + 1}</Badge>}
                        <Link to={`/logistics/shipments/${w.shipmentId}`} className="code-id text-primary hover:underline">{w.shipmentNo}</Link>
                        <span className="min-w-0 flex-1 truncate">{w.from.name} → {w.to.name}</span>
                        <StatusBadge kind="shipment" value={w.status} />
                        <span className="text-xs text-muted-foreground">due {dateTime(w.expectedArrivalAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            </TabsContent>
            <TabsContent value="trips" className="mt-4"><TripsTable /></TabsContent>
          </Tabs>
        </>
      )}
      {b && <PlanTripDialog open={planning} onClose={() => setPlanning(false)} shipmentIds={selected} originId={b.awaitingTrip.find((x) => x.shipmentId === selected[0])?.from.id} onDone={(t) => { setSelected([]); navigate(`/last-mile/trips/${t.id}`); }} />}
    </Page>
  );
}

function TripsTable() {
  const { params, setParam } = useTableParams({ sort: 'plannedStartAt' });
  const q = useQuery(trips.list(params));
  const navigate = useNavigate();
  const cols: ColumnDef<TripDto, unknown>[] = [
    { header: 'Trip', cell: ({ row }) => <span className="code-id">{row.original.tripNo}</span> },
    { header: 'From', cell: ({ row }) => row.original.origin.name },
    { header: 'Vehicle · driver', cell: ({ row }) => `${row.original.vehicleNo} · ${row.original.driverName}` },
    { header: 'Planned start', cell: ({ row }) => dateTime(row.original.plannedStartAt), meta: { sortKey: 'plannedStartAt' } },
    { header: 'Stops delivered', cell: ({ row }) => <div className="flex w-32 items-center gap-2"><Progress value={(row.original.progress.delivered / Math.max(1, row.original.progress.total)) * 100} /><span className="text-xs num">{row.original.progress.delivered}/{row.original.progress.total}</span></div> },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="trip" value={row.original.status} /> },
  ];
  return <DataTable columns={cols} query={q} params={params} setParam={setParam} onRowClick={(t) => navigate(`/last-mile/trips/${t.id}`)} empty={{ title: 'No trips yet' }} />;
}

function PlanTripDialog({ open, onClose, shipmentIds, originId, onDone }: { open: boolean; onClose: () => void; shipmentIds: string[]; originId?: string; onDone: (t: TripDto) => void }) {
  const qc = useQueryClient();
  const vehicles = useQuery(registry.vehicles());
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [start, setStart] = useState(local(new Date(Date.now() + 30 * 60000)));
  const m = useMutation({
    mutationFn: () => trips.create({ originFacilityId: originId!, vehicleNo, driverName, driverPhone, plannedStartAt: new Date(start).toISOString(), shipmentIds }),
    onSuccess: (t) => { toast.success(`${t.tripNo} planned with ${t.stops.length} stops`); void qc.invalidateQueries({ queryKey: ['last-mile'] }); void qc.invalidateQueries({ queryKey: ['trips'] }); onClose(); onDone(t); },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Plan a trip</DialogTitle><DialogDescription>{shipmentIds.length} school deliveries, visited in the order you selected them.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Vehicle</Label>
            <Select value={vehicleNo} onValueChange={(v) => { setVehicleNo(v); const veh = vehicles.data?.find((x) => x.registrationNo === v); if (veh) { setDriverName(veh.driver.name); setDriverPhone(veh.driver.phone); } }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a vehicle" /></SelectTrigger>
              <SelectContent>{(vehicles.data ?? []).map((v) => <SelectItem key={v.id} value={v.registrationNo}>{v.registrationNo} · {v.transporterName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="dn">Driver</Label><Input id="dn" value={driverName} onChange={(e) => setDriverName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="dp">Driver phone</Label><Input id="dp" inputMode="tel" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ps">Leaves at</Label><Input id="ps" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        </div>
        <DialogFooter><Button disabled={!vehicleNo || driverName.length < 2 || driverPhone.length < 10} loading={m.isPending} onClick={() => m.mutate()}><Truck /> Plan trip</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
