import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus } from 'lucide-react';
import type { IndentDto } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Page, PageHeader, Section, DetailList } from '@/components/shared/page';
import { QueryBoundary, LoadingBlock } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Timeline } from '@/components/shared/timeline';
import { indents } from '@/lib/api';
import { date, dateTime, humanize, qty, unit } from '@/lib/format';
import { statusOf } from '@/config/status';
import { useAuthStore, useCan } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function IndentDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery(indents.get(id));
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user!);
  const canApprove = useCan('indent:approve');
  const canShip = useCan('shipment:create');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['indent', id] }); void qc.invalidateQueries({ queryKey: ['indents'] }); };
  const decide = useMutation({ mutationFn: (v: Parameters<typeof indents.decide>[1]) => indents.decide(id, v), onSuccess: (i) => { toast.success(`${i.indentNo}: ${statusOf('indent', i.status).label.toLowerCase()}`); refresh(); } });
  const cancel = useMutation({ mutationFn: (r: string) => indents.cancel(id, r), onSuccess: () => { toast.success('Indent cancelled'); refresh(); } });
  return (
    <QueryBoundary query={q} loading={<Page><LoadingBlock rows={6} /></Page>}>{(i) => {
      const supplier = !me.facilityId || me.facilityId === i.supplying.id;
      const requester = !me.facilityId || me.facilityId === i.requesting.id;
      return (
        <Page>
          <PageHeader back={{ to: '/indents', label: 'Indents' }} title={<span className="code-id">{i.indentNo}</span>} description={`${i.requesting.name} asks ${i.supplying.name}`}
            meta={<><StatusBadge kind="indent" value={i.status} /><span className="text-sm text-muted-foreground">needed by {date(i.neededBy)} · {humanize(i.reason)}</span></>}
            actions={<>
              {requester && ['SUBMITTED', 'APPROVED'].includes(i.status) && !i.shipmentIds.length && <ReasonDialog trigger={<Button variant="outline">Cancel</Button>} title="Cancel indent" confirmLabel="Cancel indent" destructive onConfirm={(r) => cancel.mutateAsync(r)} />}
              {canApprove && supplier && i.status === 'SUBMITTED' && i.createdBy.userId !== me.id && (<>
                <ReasonDialog trigger={<Button variant="outline">Reject</Button>} title="Reject indent" confirmLabel="Reject" destructive onConfirm={(c) => decide.mutateAsync({ decision: 'REJECT', comment: c })} />
                <ApproveDialog indent={i} onApprove={(approved, comment) => decide.mutateAsync({ decision: 'APPROVE', approved, comment })} />
              </>)}
              {canShip && supplier && ['APPROVED', 'PARTIALLY_FULFILLED'].includes(i.status) && <Button asChild><Link to={`/logistics/shipments/new?indent=${i.id}`}><PackagePlus /> Fulfil with a shipment</Link></Button>}
            </>} />
          <Section title="Products" description="Requested, approved, shipped and received are each recorded separately." bodyClassName="p-0">
            <Table>
              <TableHeader className="bg-muted/50"><TableRow>{['Product', 'Requested', 'Approved', 'Shipped', 'Received'].map((h, k) => <TableHead key={h} className={cn('text-xs', k && 'text-right')}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{i.lines.map((l) => (
                <TableRow key={l.commodityId}>
                  <TableCell className="font-medium">{l.commodityName}</TableCell>
                  <TableCell className="text-right num">{qty(l.requested, l.unit)}</TableCell>
                  <TableCell className={cn('text-right num', i.status !== 'SUBMITTED' && l.approved < l.requested && 'text-warning')}>{i.status === 'SUBMITTED' ? '—' : qty(l.approved, l.unit)}</TableCell>
                  <TableCell className="text-right num">{qty(l.shipped, l.unit)}</TableCell>
                  <TableCell className="text-right num">{qty(l.received, l.unit)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Section>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Shipments against this indent">
              {i.shipmentIds.length ? <ul className="space-y-1 text-sm">{i.shipmentIds.map((s) => <li key={s}><Link className="code-id text-primary hover:underline" to={`/logistics/shipments/${s}`}>Open shipment</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">Not shipped yet.</p>}
              {i.notes && <div className="mt-4 border-t pt-3"><DetailList columns={1} items={[{ label: 'Note from requester', value: i.notes }]} /></div>}
            </Section>
            <Section title="History"><Timeline items={[...i.history].reverse().map((h, k) => ({ key: String(k), title: statusOf('indent', h.status).label, at: dateTime(h.at), meta: h.actor.name, body: h.comment }))} /></Section>
          </div>
        </Page>
      );
    }}</QueryBoundary>
  );
}

function ApproveDialog({ indent, onApprove }: { indent: IndentDto; onApprove: (approved: { commodityId: string; quantity: number }[], comment?: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<Record<string, string>>(() => Object.fromEntries(indent.lines.map((l) => [l.commodityId, String(l.requested)])));
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Approve</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Approve {indent.indentNo}</DialogTitle><DialogDescription>Approve what you can supply. Lower quantities are recorded against the request.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {indent.lines.map((l) => (
            <div key={l.commodityId} className="flex items-center justify-between gap-3">
              <span className="text-sm">{l.commodityName}<span className="block text-xs text-muted-foreground">asked {qty(l.requested, l.unit)}</span></span>
              <div className="flex items-center gap-1"><Input type="number" step="any" className="h-8 w-28 text-right" value={q[l.commodityId]} onChange={(e) => setQ((x) => ({ ...x, [l.commodityId]: e.target.value }))} aria-label={`Approved ${l.commodityName}`} /><span className="w-8 text-xs text-muted-foreground">{unit(l.unit)}</span></div>
            </div>
          ))}
        </div>
        <DialogFooter><Button loading={busy} onClick={async () => { setBusy(true); try { await onApprove(indent.lines.map((l) => ({ commodityId: l.commodityId, quantity: Number(q[l.commodityId]) || 0 }))); setOpen(false); } finally { setBusy(false); } }}>Approve quantities</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
