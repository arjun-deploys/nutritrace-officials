import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MapPin, Phone, Play, XCircle } from 'lucide-react';
import type { TripDto, TripStopDto } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Page, PageHeader } from '@/components/shared/page';
import { QueryBoundary, LoadingBlock } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { trips } from '@/lib/api';
import { dateTime, humanize, time } from '@/lib/format';
import { useCan } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** The run sheet: what a driver needs on a phone, one stop at a time. */
export default function TripPage() {
  const { id = '' } = useParams();
  const q = useQuery({ ...trips.get(id), refetchInterval: 30_000 });
  const qc = useQueryClient();
  const canRun = useCan('trip:run');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['trip', id] }); void qc.invalidateQueries({ queryKey: ['last-mile'] }); void qc.invalidateQueries({ queryKey: ['shipments'] }); };
  const start = useMutation({ mutationFn: () => trips.start(id), onSuccess: (t) => { toast.success(`${t.tripNo} started — stock dispatched for ${t.stops.length} stops`); refresh(); } });
  return (
    <QueryBoundary query={q} loading={<Page><LoadingBlock rows={6} /></Page>}>{(t) => (
      <Page className="max-w-3xl">
        <PageHeader back={{ to: '/last-mile', label: 'Last mile' }} title={<span className="code-id">{t.tripNo}</span>} description={`From ${t.origin.name} · ${t.vehicleNo} · ${t.driverName}`}
          meta={<><StatusBadge kind="trip" value={t.status} /><span className="text-sm text-muted-foreground">{t.startedAt ? `started ${dateTime(t.startedAt)}` : `planned ${dateTime(t.plannedStartAt)}`}</span></>}
          actions={canRun && t.status === 'PLANNED' && <Button size="lg" onClick={() => start.mutate()} loading={start.isPending}><Play /> Start trip</Button>} />
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm"><span>{t.progress.delivered} of {t.progress.total} stops delivered{t.progress.failed ? `, ${t.progress.failed} failed` : ''}</span><a href={`tel:${t.driverPhone}`} className="inline-flex items-center gap-1 text-primary"><Phone className="size-3.5" />{t.driverPhone}</a></div>
          <Progress value={(t.progress.delivered / Math.max(1, t.progress.total)) * 100} />
        </div>
        <ol className="space-y-3">
          {t.stops.map((s) => <StopCard key={s.seq} trip={t} stop={s} canRun={canRun} onChange={refresh} />)}
        </ol>
      </Page>
    )}</QueryBoundary>
  );
}

const position = () => new Promise<{ lat: number; lng: number } | undefined>((resolve) => {
  if (!navigator.geolocation) return resolve(undefined);
  navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(undefined), { timeout: 4000 });
});

function StopCard({ trip, stop, canRun, onChange }: { trip: TripDto; stop: TripStopDto; canRun: boolean; onChange: () => void }) {
  const [handover, setHandover] = useState(false);
  const [failing, setFailing] = useState(false);
  const arrive = useMutation({ mutationFn: async () => trips.arrive(trip.id, stop.seq, await position()), onSuccess: () => { toast.success(`Arrived at ${stop.facility.name}`); onChange(); } });
  const active = trip.status === 'IN_PROGRESS';
  const done = stop.status === 'DELIVERED' || stop.status === 'FAILED';
  return (
    <li className={cn('rounded-lg border bg-card p-4', stop.status === 'DELIVERED' && 'border-success/40', stop.status === 'FAILED' && 'border-danger/40')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold', done ? (stop.status === 'DELIVERED' ? 'bg-success text-white' : 'bg-danger text-white') : 'bg-muted')}>{stop.seq}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{stop.facility.name}</p><StatusBadge kind="stop" value={stop.status} /></div>
          <p className="text-sm text-muted-foreground">{stop.lineSummary}</p>
          <p className="mt-1 text-xs text-muted-foreground"><Link to={`/logistics/shipments/${stop.shipmentId}`} className="code-id text-primary hover:underline">{stop.shipmentNo}</Link>{stop.arrivedAt && ` · arrived ${time(stop.arrivedAt)}`}{stop.deliveredAt && ` · handed over ${time(stop.deliveredAt)}`}</p>
          {stop.pod?.receivedBy && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm"><CheckCircle2 className="size-4 text-success" />Received by <strong>{stop.pod.receivedBy}</strong>{stop.pod.receiverRole && ` (${stop.pod.receiverRole})`}{stop.pod.geo && <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><MapPin className="size-3" />location recorded</span>}
              {stop.pod.grnNo ? <span className={cn('text-xs', stop.pod.hasDiscrepancy ? 'text-warning' : 'text-success')}>· school receipt {stop.pod.grnNo}{stop.pod.hasDiscrepancy ? ' with discrepancy' : ''}</span> : <span className="text-xs text-muted-foreground">· school to confirm quantities</span>}</p>
          )}
          {stop.failure && <p className="mt-2 flex items-center gap-2 text-sm text-danger"><XCircle className="size-4" />{humanize(stop.failure.reason)}{stop.failure.note && ` — ${stop.failure.note}`}</p>}
        </div>
      </div>
      {canRun && active && !done && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          {stop.status === 'PENDING' && <Button variant="outline" onClick={() => arrive.mutate()} loading={arrive.isPending}><MapPin /> I have arrived</Button>}
          <Button onClick={() => setHandover(true)}><CheckCircle2 /> Hand over</Button>
          <Button variant="ghost" onClick={() => setFailing(true)}>Could not deliver</Button>
        </div>
      )}
      <HandoverDialog open={handover} onClose={() => setHandover(false)} trip={trip} stop={stop} onDone={onChange} />
      <FailDialog open={failing} onClose={() => setFailing(false)} trip={trip} stop={stop} onDone={onChange} />
    </li>
  );
}

function HandoverDialog({ open, onClose, trip, stop, onDone }: { open: boolean; onClose: () => void; trip: TripDto; stop: TripStopDto; onDone: () => void }) {
  const [receivedBy, setReceivedBy] = useState('');
  const [role, setRole] = useState('Headmaster');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string>();
  const m = useMutation({ mutationFn: async () => trips.handover(trip.id, stop.seq, { receivedBy, receiverRole: role, note: note || undefined, photoName: photo, geo: await position() }), onSuccess: () => { toast.success(`Handed over at ${stop.facility.name}`); onClose(); onDone(); } });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Hand over at {stop.facility.name}</DialogTitle><DialogDescription>Record who took the goods. The time and your location are recorded automatically. The school confirms quantities in its own receipt.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="rb">Received by</Label><Input id="rb" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Full name" /></div>
          <div className="space-y-1.5"><Label>Their role</Label>
            <Select value={role} onValueChange={setRole}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{['Headmaster', 'Teacher in charge', 'Cook', 'Store keeper', 'Other'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ph">Photo of goods at the school (optional)</Label><Input id="ph" type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0]?.name)} /></div>
          <div className="space-y-1.5"><Label htmlFor="nt">Note</Label><Textarea id="nt" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter><Button disabled={receivedBy.trim().length < 2} loading={m.isPending} onClick={() => m.mutate()}>Confirm hand-over</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FailDialog({ open, onClose, trip, stop, onDone }: { open: boolean; onClose: () => void; trip: TripDto; stop: TripStopDto; onDone: () => void }) {
  const [reason, setReason] = useState('SCHOOL_CLOSED');
  const [note, setNote] = useState('');
  const m = useMutation({ mutationFn: () => trips.fail(trip.id, stop.seq, { reason, note: note || undefined }), onSuccess: () => { toast.warning(`Delivery to ${stop.facility.name} marked failed`); onClose(); onDone(); } });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Could not deliver to {stop.facility.name}</DialogTitle><DialogDescription>The goods stay on the vehicle. The district team is alerted to re-plan this delivery.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Select value={reason} onValueChange={setReason}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{['SCHOOL_CLOSED', 'NO_RECEIVER', 'ROAD_BLOCKED', 'VEHICLE_BREAKDOWN', 'REFUSED', 'OTHER'].map((r) => <SelectItem key={r} value={r}>{humanize(r)}</SelectItem>)}</SelectContent></Select>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened" aria-label="Note" />
        </div>
        <DialogFooter><Button variant="destructive" loading={m.isPending} onClick={() => m.mutate()}>Mark failed</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
