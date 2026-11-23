import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { RecallAffectedDto, RecallDto } from '@nt/domain';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { LotLink } from '@/components/shared/links';
import { QueryBoundary, LoadingBlock } from '@/components/shared/states';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Progress } from '@/components/ui/progress';
import { useTableParams } from '@/hooks/use-table-params';
import { quality } from '@/lib/api';
import { ago, dateTime, humanize, num, qty } from '@/lib/format';
import { useCan, useUser } from '@/stores/auth';
import { toast } from 'sonner';

export default function RecallsPage() {
  const { params, setParam } = useTableParams();
  const q = useQuery(quality.recalls(params));
  const navigate = useNavigate();
  const columns: ColumnDef<RecallDto, unknown>[] = [
    { header: 'Recall', cell: ({ row }) => <span className="code-id">{row.original.recallNo}</span> },
    { header: 'Lots', cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.lots.map((l) => <LotLink key={l.id} id={l.id} code={l.code} />)}</div> },
    { header: 'Reason', cell: ({ row }) => <span className="line-clamp-2 max-w-md text-sm">{row.original.reason}</span> },
    { header: 'Acknowledged', cell: ({ row }) => { const s = row.original.stats; return <div className="flex w-32 items-center gap-2"><Progress value={s.facilities ? (s.acknowledged / s.facilities) * 100 : 0} tone="warning" /><span className="text-xs num">{s.acknowledged}/{s.facilities}</span></div>; } },
    { header: 'Initiated', cell: ({ row }) => ago(row.original.initiatedAt) },
    { header: 'Severity', cell: ({ row }) => <StatusBadge kind="severity" value={row.original.severity} /> },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="recall" value={row.original.status} /> },
  ];
  return (
    <Page>
      <PageHeader title="Recalls" description="When a lot is unsafe, the custody ledger tells us exactly which warehouses, kitchens and schools received it — and how much is left." />
      <DataTable columns={columns} query={q} params={params} setParam={setParam} onRowClick={(r) => navigate(`/quality/recalls/${r.id}`)}
        empty={{ title: 'No recalls', description: 'Start a recall from a lot page if a quality or safety problem is found.' }} />
    </Page>
  );
}

export function RecallDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery(quality.recall(id));
  const qc = useQueryClient();
  const canManage = useCan('recall:manage');
  const close = useMutation({ mutationFn: (note: string) => quality.closeRecall(id, note), onSuccess: () => { toast.success('Recall closed'); void qc.invalidateQueries({ queryKey: ['recall', id] }); } });
  return (
    <QueryBoundary query={q} loading={<Page><LoadingBlock rows={8} /></Page>}>{(r) => {
      const unit = r.lots[0]?.unit ?? 'KG';
      const columns: ColumnDef<RecallAffectedDto, unknown>[] = [
        { header: 'Facility', cell: ({ row }) => <div><p className="font-medium">{row.original.facility.name}</p><p className="text-xs text-muted-foreground">{humanize(row.original.facility.type)}</p></div> },
        { header: 'Received', cell: ({ row }) => qty(row.original.receivedQty, unit), meta: { align: 'right' } },
        { header: 'Cooked', cell: ({ row }) => qty(row.original.consumedQty, unit), meta: { align: 'right' } },
        { header: 'Meals served with it', cell: ({ row }) => num(row.original.mealsServedWithLot), meta: { align: 'right' } },
        { header: 'Still on hand', cell: ({ row }) => <span className={row.original.onHandQty > 0 ? 'font-semibold text-danger' : undefined}>{qty(row.original.onHandQty, unit)}</span>, meta: { align: 'right' } },
        { header: 'Acknowledgement', cell: ({ row }) => row.original.acknowledged
          ? <span className="text-sm"><CheckCircle2 className="mr-1 inline size-4 text-success" />{row.original.acknowledgedBy?.name}, {ago(row.original.acknowledgedAt)}<span className="block text-xs text-muted-foreground">Quarantined {qty(row.original.quarantinedQty ?? 0, unit)}</span></span>
          : r.status !== 'CLOSED' ? <AckDialog recall={r} row={row.original} unit={unit} /> : <Badge tone="neutral">Not acknowledged</Badge> },
      ];
      return (
        <Page>
          <PageHeader back={{ to: '/quality/recalls', label: 'Recalls' }} title={<span className="code-id">{r.recallNo}</span>} description={r.reason}
            meta={<><StatusBadge kind="recall" value={r.status} /><StatusBadge kind="severity" value={r.severity} /><span className="text-sm text-muted-foreground">by {r.initiatedBy.name}, {dateTime(r.initiatedAt)}</span></>}
            actions={canManage && r.status !== 'CLOSED' && <ReasonDialog trigger={<Button>Close recall</Button>} title="Close recall" description="Facilities still holding stock must acknowledge first." confirmLabel="Close recall" minLength={10} onConfirm={(n) => close.mutateAsync(n)} />} />
          <KpiStrip kpis={[
            { key: 'f', label: 'Facilities reached', value: r.stats.facilities },
            { key: 's', label: 'Schools reached', value: r.stats.schools },
            { key: 'a', label: 'Acknowledged', value: r.stats.acknowledged, hint: `${r.stats.facilities - r.stats.acknowledged} pending` },
            { key: 'o', label: `Still on hand (${unit.toLowerCase()})`, value: r.stats.onHandQty, higherIsBetter: false },
            { key: 'c', label: `Already cooked (${unit.toLowerCase()})`, value: r.stats.consumedQty },
            { key: 'm', label: 'Meals served with these lots', value: r.stats.mealsServed },
          ]} />
          <Section title="Instruction to facilities"><p className="text-sm">{r.instruction}</p><div className="mt-3 flex flex-wrap gap-1.5">{r.lots.map((l) => <LotLink key={l.id} id={l.id} code={l.code} />)}</div></Section>
          <DataTable columns={columns} rows={[...r.affected].sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged) || b.onHandQty - a.onHandQty)} getRowId={(a) => a.facility.id} empty={{ title: 'No downstream facilities' }} />
        </Page>
      );
    }}</QueryBoundary>
  );
}

function AckDialog({ recall, row, unit }: { recall: RecallDto; row: RecallAffectedDto; unit: string }) {
  const user = useUser();
  const canAck = useCan('recall:acknowledge') && (!user.facilityId || user.facilityId === row.facility.id);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [quarantined, setQuarantined] = useState(String(row.onHandQty));
  const m = useMutation({ mutationFn: () => quality.acknowledge(recall.id, { facilityId: row.facility.id, quarantinedQty: Number(quarantined) }), onSuccess: () => { toast.success('Acknowledged'); setOpen(false); void qc.invalidateQueries({ queryKey: ['recall', recall.id] }); } });
  if (!canAck) return <Badge tone="warning">Awaiting</Badge>;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Acknowledge</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Acknowledge for {row.facility.name}</DialogTitle><DialogDescription>Confirm the lot has been moved to quarantine and is no longer being used.</DialogDescription></DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="qq">Quantity quarantined ({unit.toLowerCase()})</Label><Input id="qq" type="number" step="any" value={quarantined} onChange={(e) => setQuarantined(e.target.value)} className="w-40" /><p className="text-xs text-muted-foreground">The ledger shows {qty(row.onHandQty, unit)} on hand here.</p></div>
        <DialogFooter><Button loading={m.isPending} onClick={() => m.mutate()}>Confirm quarantine</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
