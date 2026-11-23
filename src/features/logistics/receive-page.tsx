import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { grnCreateSchema, REJECTION_REASONS, type GrnCreateInput, type ShipmentDto } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { QueryBoundary, LoadingBlock } from '@/components/shared/states';
import { FormError } from '@/components/shared/form';
import { logistics, inventory } from '@/lib/api';
import { humanize, qty, unit } from '@/lib/format';
import { newKey, useOfflineQueue } from '@/stores/offline-queue';
import { toast } from 'sonner';

interface LineState { received: string; rejected: string; reason?: string }

export default function ReceivePage() {
  const { id = '' } = useParams();
  const q = useQuery(logistics.shipment(id));
  return <QueryBoundary query={q} loading={<Page><LoadingBlock /></Page>}>{(s) => <ReceiveForm shipment={s} />}</QueryBoundary>;
}

function ReceiveForm({ shipment }: { shipment: ShipmentDto }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const enqueue = useOfflineQueue((s) => s.enqueue);
  const [key] = useState(newKey);
  const [lines, setLines] = useState<Record<string, LineState>>(() => Object.fromEntries(shipment.lines.map((l) => [l.lotId, { received: String(l.dispatchedQty), rejected: '0' }])));
  const [sealIntact, setSealIntact] = useState(true);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string>();
  const payload: GrnCreateInput = useMemo(() => ({
    facilityId: shipment.to.id, shipmentId: shipment.id, receivedAt: new Date().toISOString(), sealIntact, remarks: remarks || undefined, evidence: [],
    lines: shipment.lines.map((l) => {
      const st = lines[l.lotId]!;
      const received = Number(st.received);
      const rejected = Number(st.rejected);
      return { lotId: l.lotId, expectedQty: l.dispatchedQty, receivedQty: received, acceptedQty: Math.max(0, received - rejected), rejectedQty: rejected, rejectionReason: st.reason as GrnCreateInput['lines'][number]['rejectionReason'] };
    }),
  }), [lines, sealIntact, remarks, shipment]);
  const m = useMutation({
    mutationFn: () => inventory.receive(payload, key),
    meta: { silent: true },
    onSuccess: (g) => { toast.success(`${g.grnNo} recorded${g.hasDiscrepancy ? ' with a discrepancy' : ''}`); void qc.invalidateQueries(); navigate(`/logistics/shipments/${shipment.id}`); },
    onError: (e) => {
      if (!navigator.onLine) {
        enqueue({ id: key, kind: 'receipt', label: `Receipt of ${shipment.shipmentNo}`, payload });
        toast.info('Saved on this device. It will be sent when you are back online.');
        navigate('/logistics/shipments');
      } else setError((e as Error).message);
    },
  });
  const submit = () => {
    setError(undefined);
    const r = grnCreateSchema.safeParse(payload);
    if (!r.success) return setError(r.error.issues[0]?.message);
    m.mutate();
  };
  return (
    <Page className="max-w-4xl">
      <PageHeader back={{ to: `/logistics/shipments/${shipment.id}`, label: shipment.shipmentNo }} title="Receive goods" description={`At ${shipment.to.name}. Weigh or count what arrived; record rejected quantity separately. This becomes the proof of delivery.`} />
      <Section title="What arrived">
        <ul className="divide-y">
          {shipment.lines.map((l) => {
            const st = lines[l.lotId]!;
            const short = Number(st.received) < l.dispatchedQty;
            const set = (patch: Partial<LineState>) => setLines((x) => ({ ...x, [l.lotId]: { ...st, ...patch } }));
            return (
              <li key={l.lotId} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1.4fr_1fr_1fr_1.2fr] sm:items-end">
                <div><p className="code-id text-trace-ink">{l.lotCode}</p><p className="text-sm text-muted-foreground">{l.commodityName} · dispatched {qty(l.dispatchedQty, l.unit)}</p></div>
                <div className="space-y-1.5"><Label htmlFor={`r-${l.lotId}`}>Received ({unit(l.unit)})</Label><Input id={`r-${l.lotId}`} type="number" inputMode="decimal" step="any" value={st.received} onChange={(e) => set({ received: e.target.value })} className={short ? 'border-warning' : undefined} /></div>
                <div className="space-y-1.5"><Label htmlFor={`x-${l.lotId}`}>Rejected ({unit(l.unit)})</Label><Input id={`x-${l.lotId}`} type="number" inputMode="decimal" step="any" value={st.rejected} onChange={(e) => set({ rejected: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Reason for rejection</Label>
                  <Select value={st.reason} onValueChange={(v) => set({ reason: v })} disabled={!Number(st.rejected)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={Number(st.rejected) ? 'Choose' : 'Nothing rejected'} /></SelectTrigger>
                    <SelectContent>{REJECTION_REASONS.map((r) => <SelectItem key={r} value={r}>{humanize(r)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {short && <p className="flex items-center gap-1.5 text-xs text-warning sm:col-span-4"><AlertTriangle className="size-3.5" /> {qty(l.dispatchedQty - Number(st.received), l.unit)} short — a discrepancy case will be opened automatically.</p>}
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="Condition">
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-md border p-3"><span><span className="block text-sm font-medium">Vehicle seal intact</span><span className="text-xs text-muted-foreground">Turn off if the seal was broken or missing.</span></span><Switch checked={sealIntact} onCheckedChange={setSealIntact} /></label>
          <div className="space-y-1.5"><Label htmlFor="rem">Remarks</Label><Textarea id="rem" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Condition of bags, weighment slip number, anything the next person should know" /></div>
        </div>
      </Section>
      <FormError message={error} />
      <div className="flex justify-end"><Button size="lg" onClick={submit} loading={m.isPending}>Record receipt</Button></div>
    </Page>
  );
}
