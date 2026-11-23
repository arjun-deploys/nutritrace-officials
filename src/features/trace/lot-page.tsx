import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, CircleAlert, Printer, QrCode, ShieldAlert, ShieldCheck, Siren } from 'lucide-react';
import { can, lotQrPayload, type TraceEventDto, type CustodyStage } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader, Section, DetailList } from '@/components/shared/page';
import { CustodyRibbonFull, STAGE_COLOR } from '@/components/shared/custody-ribbon';
import { QueryBoundary, LoadingBlock } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Timeline } from '@/components/shared/timeline';
import { Progress } from '@/components/ui/progress';
import { quality, trace } from '@/lib/api';
import { date, dateTime, humanize, num, qty } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { stageOfEvent } from '@nt/domain';
import { MassBalance } from './mass-balance';
import { TraceLanes } from './trace-graph';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';

const EVENT_TITLE: Record<string, (e: TraceEventDto) => string> = {
  LOT_CREATED: (e) => `Lot created at ${e.from?.name}`,
  DISPATCHED: (e) => `Dispatched ${e.from?.name} → ${e.to?.name}`,
  RECEIVED: (e) => `${e.quantityKind === 'ACCEPTED' ? 'Accepted' : e.quantityKind === 'REJECTED' ? 'Rejected' : 'Received'} at ${e.to?.name}`,
  INSPECTED: (e) => `Inspected at ${e.facility?.name}`,
  STATUS_CHANGED: () => 'Status changed',
  ADJUSTED: (e) => `Stock adjusted at ${e.facility?.name}`,
  CONSUMED: (e) => `Issued to kitchen at ${e.facility?.name}`,
  WASTAGE_RECORDED: (e) => `Wastage at ${e.facility?.name}`,
  RECALL_INITIATED: () => 'Recall initiated',
  RECALL_ACKNOWLEDGED: (e) => `Recall acknowledged by ${e.facility?.name}`,
  RECALL_CLOSED: () => 'Recall closed',
};

export default function LotPage() {
  const { id = '' } = useParams();
  const journey = useQuery(trace.journey(id));
  const [direction] = useState<'forward'>('forward');
  const graph = useQuery(trace.graph(id, direction));
  const perms = useAuthStore((s) => s.user?.permissions);

  return (
    <QueryBoundary query={journey} loading={<Page><LoadingBlock rows={8} /></Page>}>{(j) => {
      const { lot, flow, completeness, integrity } = j;
      const u = lot.commodity.unit;
      return (
        <Page>
          <PageHeader
            back={{ to: '/trace', label: 'Traceability' }}
            title={<span className="code-id text-trace-ink">{lot.code}</span>}
            description={`${lot.commodity.name} from ${lot.supplier.name}, ${lot.origin.district}, ${lot.origin.state}`}
            meta={<><StatusBadge kind="lot" value={lot.status} /><span className="text-muted-foreground num">{qty(lot.quantity, u)} · packed {date(lot.packedOn)} · expires {date(lot.expiresOn)}</span></>}
            actions={<>
              <QrDialog code={lot.code} name={lot.commodity.name} />
              {can(perms, 'recall:manage') && lot.status !== 'RECALLED' && <RecallDialog lotId={lot.id} lotCode={lot.code} />}
            </>}
          />
          {lot.status === 'RECALLED' && (
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
              <Siren className="mt-0.5 size-5 shrink-0" /><p>This lot is under recall. It cannot be issued or dispatched. <Link to="/quality/recalls" className="font-medium underline">See the recall</Link>.</p>
            </div>
          )}
          <CustodyRibbonFull stages={j.stages} unit={u} />

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Section title="Where every unit went" description="Mass balance from custody events. Dispatch, receipt, issue and service are counted separately, never inferred.">
              <MassBalance flow={flow} unit={u} />
            </Section>
            <Section title="Record completeness" actions={<span className="text-2xl font-semibold num">{completeness.score}%</span>}>
              <Progress value={completeness.score} tone={completeness.score >= 90 ? 'primary' : completeness.score >= 70 ? 'warning' : 'danger'} label="Record completeness" className="mb-4" />
              <ul className="space-y-2 text-sm">
                {completeness.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2">
                    {c.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />}
                    <span>{c.label}{c.detail && <span className="block text-xs text-muted-foreground">{c.detail}</span>}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                {integrity.verified ? <ShieldCheck className="size-4 text-success" /> : <ShieldAlert className="size-4 text-danger" />}
                {integrity.verified ? `${num(integrity.eventsChecked)} events hash-verified` : `Event ${integrity.brokenAt} failed hash verification`}
              </p>
            </Section>
          </div>

          <Tabs defaultValue="forward">
            <TabsList>
              <TabsTrigger value="forward">Where it went</TabsTrigger>
              <TabsTrigger value="events">Custody log ({j.events.length})</TabsTrigger>
              <TabsTrigger value="facts">Lot details</TabsTrigger>
            </TabsList>
            <TabsContent value="forward" className="mt-4">
              <Section>{graph.data ? <TraceLanes graph={graph.data} /> : <LoadingBlock rows={3} />}</Section>
            </TabsContent>
            <TabsContent value="events" className="mt-4">
              <Section description="Append-only. Each entry carries the hash of the one before it.">
                <Timeline items={[...j.events].reverse().map((e) => {
                  const stage = stageOfEvent(e) as CustodyStage | undefined;
                  return {
                    key: e.id,
                    title: (EVENT_TITLE[e.type] ?? ((x: TraceEventDto) => humanize(x.type)))(e),
                    at: dateTime(e.occurredAt),
                    color: e.quantityKind === 'REJECTED' || e.type.startsWith('RECALL') ? 'var(--danger)' : stage ? STAGE_COLOR[stage] : 'var(--muted-foreground)',
                    meta: <span className="num">{e.quantity ? `${qty(e.quantity, e.unit)} ${humanize(e.quantityKind).toLowerCase()} · ` : ''}{e.actor.name} ({humanize(e.actor.role)}) · #{e.seq} · {e.hash.slice(0, 10)}…</span>,
                    body: e.note || e.refs.shipmentNo || e.refs.batchNo ? (
                      <span className="text-muted-foreground">
                        {e.refs.shipmentNo && <>Shipment <Link className="text-primary hover:underline" to={`/logistics/shipments/${e.refs.shipmentId}`}>{e.refs.shipmentNo}</Link>. </>}
                        {e.refs.batchNo && <>Meal batch {e.refs.batchNo}. </>}
                        {e.note}
                      </span>
                    ) : undefined,
                  };
                })} />
              </Section>
            </TabsContent>
            <TabsContent value="facts" className="mt-4">
              <Section>
                <DetailList columns={3} items={[
                  { label: 'Lot code', value: <span className="code-id">{lot.code}</span> },
                  { label: 'Supplier lot number', value: lot.supplierLotNo },
                  { label: 'Quality certificate', value: lot.certificateNo ?? 'Not provided' },
                  { label: 'Purchase order', value: <Link className="text-primary hover:underline" to={`/procurement/orders/${lot.poId}`}>{lot.poNumber}</Link> },
                  { label: 'Commodity', value: lot.commodity.name },
                  { label: 'Origin', value: `${lot.origin.district}, ${lot.origin.state}` },
                  { label: 'Packed on', value: date(lot.packedOn) },
                  { label: 'Expires on', value: date(lot.expiresOn) },
                  { label: 'Quantity at source', value: qty(lot.quantity, u) },
                ]} />
              </Section>
            </TabsContent>
          </Tabs>
        </Page>
      );
    }}</QueryBoundary>
  );
}

function QrDialog({ code, name }: { code: string; name: string }) {
  const payload = lotQrPayload(window.location.origin, code);
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline"><QrCode /> Lot label</Button></DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Lot label</DialogTitle><DialogDescription>Print and fix to each bag or crate. Scanning opens the public provenance page — no quantities or personal data.</DialogDescription></DialogHeader>
        <div id="lot-label" className="mx-auto space-y-2 rounded-lg border p-4 text-center">
          <QRCodeSVG value={payload} size={176} level="M" className="mx-auto" />
          <p className="code-id text-lg">{code}</p>
          <p className="text-sm text-muted-foreground">{name}</p>
        </div>
        <DialogFooter><Button onClick={() => window.print()}><Printer /> Print</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecallDialog({ lotId, lotCode }: { lotId: string; lotCode: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [instruction, setInstruction] = useState('Stop using this lot immediately. Move remaining stock to a marked quarantine area and acknowledge in NutriTrace.');
  const [severity, setSeverity] = useState<'HIGH' | 'CRITICAL'>('HIGH');
  const m = useMutation({
    mutationFn: () => quality.initiateRecall({ lotIds: [lotId], reason, instruction, severity }),
    onSuccess: (r) => {
      toast.success(`Recall ${r.recallNo} issued to ${r.stats.facilities} facilities`);
      void qc.invalidateQueries();
      navigate(`/quality/recalls/${r.id}`);
    },
  });
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="destructive"><Siren /> Recall lot</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recall {lotCode}</DialogTitle>
          <DialogDescription>Every facility that received this lot is notified and must acknowledge. The lot is blocked from issue and dispatch immediately.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="r-reason">Why is it being recalled?</Label><Textarea id="r-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Laboratory report LAB-2611-118 found aflatoxin above the FSSAI limit" /></div>
          <div className="space-y-1.5"><Label htmlFor="r-ins">Instruction to facilities</Label><Textarea id="r-ins" rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="HIGH">High — remove from use today</SelectItem><SelectItem value="CRITICAL">Critical — health risk, act immediately</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button variant="destructive" disabled={reason.trim().length < 10 || instruction.trim().length < 10} loading={m.isPending} onClick={() => m.mutate()}>Issue recall</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
