import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ADJUSTMENT_REASONS, LOT_STATUSES, type AdjustmentDto, type GrnDto, type LedgerEntryDto, type StockRowDto, type StockSummaryDto, type AdjustmentReason } from '@nt/domain';
import { SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { LotLink } from '@/components/shared/links';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { useTableParams } from '@/hooks/use-table-params';
import { inventory, registry } from '@/lib/api';
import { date, dateTime, daysUntil, humanize, num, qty, qtyShort } from '@/lib/format';
import { statusOf } from '@/config/status';
import { useAuthStore, useCan } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';

const TABS = ['position', 'lots', 'receipts', 'adjustments', 'ledger'] as const;

export default function InventoryPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as (typeof TABS)[number]) ?? 'position';
  return (
    <Page>
      <PageHeader title="Inventory" description="Lot-wise stock at every warehouse, store and kitchen in your area. Lots on hold or recall are counted but cannot be issued." />
      <Tabs value={tab} onValueChange={(v) => setSp(new URLSearchParams({ tab: v }))}>
        <TabsList>
          <TabsTrigger value="position">Position</TabsTrigger>
          <TabsTrigger value="lots">Lots in stock</TabsTrigger>
          <TabsTrigger value="receipts">Goods receipts</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'position' && <PositionTab />}
      {tab === 'lots' && <LotsTab />}
      {tab === 'receipts' && <ReceiptsTab />}
      {tab === 'adjustments' && <AdjustmentsTab />}
      {tab === 'ledger' && <LedgerTab />}
    </Page>
  );
}

function PositionTab() {
  const q = useQuery(inventory.summary());
  const columns: ColumnDef<StockSummaryDto, unknown>[] = [
    { header: 'Commodity', cell: ({ row }) => <span className="font-medium">{row.original.commodityName}</span> },
    { header: 'On hand', cell: ({ row }) => qtyShort(row.original.onHand, row.original.unit), meta: { align: 'right' } },
    { header: 'Usable', cell: ({ row }) => qtyShort(row.original.available, row.original.unit), meta: { align: 'right' } },
    { header: 'Held / in QC', cell: ({ row }) => (row.original.onHold ? <span className="text-danger">{qtyShort(row.original.onHold, row.original.unit)}</span> : '—'), meta: { align: 'right' } },
    { header: 'Near expiry', cell: ({ row }) => (row.original.nearExpiry ? <span className="text-warning">{qtyShort(row.original.nearExpiry, row.original.unit)}</span> : '—'), meta: { align: 'right' } },
    { header: 'Used per day', cell: ({ row }) => qty(row.original.avgDailyConsumption, row.original.unit), meta: { align: 'right' } },
    { header: 'Days of cover', cell: ({ row }) => {
      const d = row.original.daysOfCover;
      return d === null ? <span className="text-muted-foreground">—</span> : <span className={cn('font-semibold', d < 3 ? 'text-danger' : d < 7 ? 'text-warning' : 'text-success')}>{num(d)}</span>;
    }, meta: { align: 'right' } },
    { header: 'Lots · places', cell: ({ row }) => `${row.original.lots} · ${row.original.facilities}`, meta: { align: 'right' } },
  ];
  return <DataTable columns={columns} rows={q.data} loading={q.isPending} empty={{ title: 'No stock in this area' }} getRowId={(r) => r.commodityId} />;
}

function LotsTab() {
  const { params, setParam } = useTableParams({ sort: 'lot.expiresOn', order: 'asc' });
  const q = useQuery(inventory.stock(params));
  const commodities = useQuery(registry.commodities());
  const [adjusting, setAdjusting] = useState<StockRowDto>();
  const canAdjust = useCan('stock:adjust');
  const columns: ColumnDef<StockRowDto, unknown>[] = [
    { header: 'Lot', cell: ({ row }) => <LotLink id={row.original.lot.id} code={row.original.lot.code} /> },
    { header: 'Commodity', cell: ({ row }) => row.original.lot.commodityName },
    { header: 'Facility', cell: ({ row }) => <span className="block max-w-56 truncate">{row.original.facility.name}</span>, meta: { sortKey: 'facility.name' } },
    { header: 'On hand', cell: ({ row }) => qty(row.original.onHand, row.original.lot.unit), meta: { align: 'right', sortKey: 'onHand' } },
    { header: 'Reserved', cell: ({ row }) => (row.original.reserved ? qty(row.original.reserved, row.original.lot.unit) : '—'), meta: { align: 'right' } },
    { header: 'Expires', cell: ({ row }) => { const d = daysUntil(row.original.lot.expiresOn); return <span className={cn(d < 0 ? 'text-danger' : d < 30 && 'text-warning')}>{date(row.original.lot.expiresOn)}</span>; }, meta: { sortKey: 'lot.expiresOn' } },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="lot" value={row.original.lot.status} /> },
    ...(canAdjust ? [{ id: 'act', header: '', cell: ({ row }) => <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setAdjusting(row.original); }}><SlidersHorizontal /> Adjust</Button> } as ColumnDef<StockRowDto, unknown>] : []),
  ];
  return (
    <>
      <DataTable columns={columns} query={q} params={params} setParam={setParam} searchPlaceholder="Lot code, facility or commodity"
        filters={[
          { key: 'commodityId', label: 'Commodity', options: (commodities.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
          { key: 'lotStatus', label: 'Lot status', options: LOT_STATUSES.map((s) => ({ value: s, label: statusOf('lot', s).label })) },
          { key: 'nearExpiry', label: 'Expiry', options: [{ value: 'true', label: 'Near expiry only' }] },
        ]} empty={{ title: 'No lots match' }} />
      <AdjustDialog row={adjusting} onClose={() => setAdjusting(undefined)} />
    </>
  );
}

function AdjustDialog({ row, onClose }: { row?: StockRowDto; onClose: () => void }) {
  const qc = useQueryClient();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('CYCLE_COUNT');
  const [remarks, setRemarks] = useState('');
  const m = useMutation({
    mutationFn: () => inventory.requestAdjustment({ facilityId: row!.facility.id, lotId: row!.lot.id, quantityDelta: Number(delta), reason, remarks }),
    onSuccess: (a) => { toast.success(`${a.adjNo} sent for approval`); void qc.invalidateQueries({ queryKey: ['adjustments'] }); onClose(); setDelta(''); setRemarks(''); },
  });
  const n = Number(delta);
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adjust {row?.lot.code}</DialogTitle><DialogDescription>At {row?.facility.name}. A district officer must approve before stock changes.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="adj-d">Change in quantity ({row && qty(row.onHand, row.lot.unit)} on hand)</Label><Input id="adj-d" type="number" step="any" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="Negative to reduce, e.g. -12.5" /></div>
          <div className="space-y-1.5"><Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as AdjustmentReason)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{ADJUSTMENT_REASONS.map((r) => <SelectItem key={r} value={r}>{humanize(r)}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="adj-r">Explanation</Label><Textarea id="adj-r" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="What was found during the physical count" /></div>
        </div>
        <DialogFooter><Button disabled={!n || remarks.trim().length < 5} loading={m.isPending} onClick={() => m.mutate()}>Request approval</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptsTab() {
  const { params, setParam } = useTableParams({ sort: 'receivedAt' });
  const q = useQuery(inventory.receipts(params));
  const columns: ColumnDef<GrnDto, unknown>[] = [
    { header: 'Receipt', cell: ({ row }) => <span className="code-id">{row.original.grnNo}</span> },
    { header: 'Shipment', cell: ({ row }) => <span className="code-id text-muted-foreground">{row.original.shipmentNo}</span> },
    { header: 'Facility', cell: ({ row }) => row.original.facility.name },
    { header: 'Received', cell: ({ row }) => dateTime(row.original.receivedAt), meta: { sortKey: 'receivedAt' } },
    { header: 'Lines', cell: ({ row }) => row.original.lines.map((l) => `${l.commodityName.split(' ')[0]} ${num(l.acceptedQty)}`).join(', ') },
    { header: 'Result', cell: ({ row }) => (row.original.hasDiscrepancy ? <Badge tone="warning">Discrepancy</Badge> : <Badge tone="success">In full</Badge>) },
    { header: 'By', cell: ({ row }) => row.original.receivedBy.name },
  ];
  return <DataTable columns={columns} query={q} params={params} setParam={setParam} searchPlaceholder="Receipt or shipment number"
    filters={[{ key: 'discrepancy', label: 'Result', options: [{ value: 'true', label: 'With discrepancy' }] }]} empty={{ title: 'No receipts yet' }} />;
}

function AdjustmentsTab() {
  const { params, setParam } = useTableParams({ status: 'PENDING' });
  const q = useQuery(inventory.adjustments(params));
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user?.id);
  const canApprove = useCan('stock:adjust:approve');
  const decide = useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: 'APPROVE' | 'REJECT'; comment: string }) => inventory.decideAdjustment(id, { decision, comment }),
    onSuccess: (a) => { toast.success(`${a.adjNo} ${a.status.toLowerCase()}`); void qc.invalidateQueries({ queryKey: ['adjustments'] }); void qc.invalidateQueries({ queryKey: ['stock'] }); },
  });
  const columns: ColumnDef<AdjustmentDto, unknown>[] = [
    { header: 'Ref', cell: ({ row }) => <span className="code-id">{row.original.adjNo}</span> },
    { header: 'Lot', cell: ({ row }) => <LotLink id={row.original.lot.id} code={row.original.lot.code} /> },
    { header: 'Facility', cell: ({ row }) => row.original.facility.name },
    { header: 'Change', cell: ({ row }) => <span className={row.original.quantityDelta < 0 ? 'text-danger' : 'text-success'}>{row.original.quantityDelta > 0 ? '+' : ''}{qty(row.original.quantityDelta, row.original.lot.unit)}</span>, meta: { align: 'right' } },
    { header: 'Reason', cell: ({ row }) => <div className="max-w-72"><p>{humanize(row.original.reason)}</p><p className="truncate text-xs text-muted-foreground">{row.original.remarks}</p></div> },
    { header: 'Requested', cell: ({ row }) => <span className="text-sm">{row.original.requestedBy.name}<br /><span className="text-xs text-muted-foreground">{dateTime(row.original.requestedAt)}</span></span> },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="approval" value={row.original.status} /> },
    { id: 'act', header: '', cell: ({ row }) => canApprove && row.original.status === 'PENDING' && row.original.requestedBy.userId !== me ? (
      <div className="flex gap-1">
        <ReasonDialog trigger={<Button size="sm" variant="outline">Reject</Button>} title="Reject adjustment" confirmLabel="Reject" minLength={3} onConfirm={(c) => decide.mutateAsync({ id: row.original.id, decision: 'REJECT', comment: c })} />
        <ReasonDialog trigger={<Button size="sm">Approve</Button>} title="Approve adjustment" description="Stock changes immediately and the change enters the custody ledger." confirmLabel="Approve" minLength={3} onConfirm={(c) => decide.mutateAsync({ id: row.original.id, decision: 'APPROVE', comment: c })} />
      </div>
    ) : null },
  ];
  return <DataTable columns={columns} query={q} params={params} setParam={setParam}
    filters={[{ key: 'status', label: 'Status', options: [{ value: 'PENDING', label: 'Awaiting approval' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }] }]} empty={{ title: 'No adjustments' }} />;
}

function LedgerTab() {
  const { params, setParam } = useTableParams({ sort: 'at' });
  const q = useQuery(inventory.ledger(params));
  const navigate = useNavigate();
  const columns: ColumnDef<LedgerEntryDto, unknown>[] = [
    { header: 'When', cell: ({ row }) => dateTime(row.original.at), meta: { sortKey: 'at' } },
    { header: 'Movement', cell: ({ row }) => <Badge tone={row.original.quantity < 0 ? 'neutral' : 'success'}>{humanize(row.original.type)}</Badge> },
    { header: 'Lot', cell: ({ row }) => <LotLink id={row.original.lotId} code={row.original.lotCode} /> },
    { header: 'Quantity', cell: ({ row }) => <span className={row.original.quantity < 0 ? 'text-danger' : 'text-success'}>{row.original.quantity > 0 ? '+' : ''}{qty(row.original.quantity, row.original.unit)}</span>, meta: { align: 'right' } },
    { header: 'Balance', cell: ({ row }) => qty(row.original.balanceAfter, row.original.unit), meta: { align: 'right' } },
    { header: 'Reference', cell: ({ row }) => <span className="code-id text-muted-foreground">{row.original.ref.label}</span> },
    { header: 'By', cell: ({ row }) => row.original.actor.name },
  ];
  return <DataTable columns={columns} query={q} params={params} setParam={setParam} dense
    filters={[{ key: 'type', label: 'Movement', options: ['RECEIPT', 'DISPATCH', 'ISSUE', 'ADJUSTMENT'].map((t) => ({ value: t, label: humanize(t) })) }]}
    onRowClick={(r) => navigate(`/trace/lots/${r.lotId}`)} empty={{ title: 'No movements yet' }} />;
}
