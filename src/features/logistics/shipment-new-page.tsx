import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { allocateFefo, type StockRowDto } from '@nt/domain';
import { Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { FacilityPicker } from '@/components/shared/facility-picker';
import { FormError } from '@/components/shared/form';
import { StatusBadge } from '@/components/shared/status';
import { indents, inventory, logistics } from '@/lib/api';
import { date, qty, unit } from '@/lib/format';
import { useUser } from '@/stores/auth';
import { toast } from 'sonner';

export default function ShipmentNewPage() {
  const navigate = useNavigate();
  const user = useUser();
  const [sp] = useSearchParams();
  const indentId = sp.get('indent') ?? undefined;
  const indent = useQuery({ ...indents.get(indentId ?? ''), enabled: !!indentId });
  const [from, setFrom] = useState(user.facilityId ?? '');
  const [to, setTo] = useState('');
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [dispatchAt, setDispatchAt] = useState(local(new Date()));
  const [arriveAt, setArriveAt] = useState(local(new Date(Date.now() + 8 * 3_600_000)));
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [need, setNeed] = useState<{ commodityId: string; qty: string }>({ commodityId: '', qty: '' });
  const stock = useQuery({ ...inventory.stock({ facilityId: from, pageSize: 200, sort: 'lot.expiresOn', order: 'asc' }), enabled: !!from });
  const rows = stock.data?.data ?? [];
  // Fulfilling an indent: route and quantities come from the approved request, lots are picked FEFO.
  useEffect(() => {
    const i = indent.data;
    if (!i) return;
    setFrom(i.supplying.id);
    setTo(i.requesting.id);
  }, [indent.data]);
  useEffect(() => {
    const i = indent.data;
    if (!i || !rows.length || Object.keys(picks).length) return;
    const next: Record<string, number> = {};
    for (const l of i.lines) {
      const need = Math.max(0, l.approved - l.shipped);
      if (!need) continue;
      const eligible = rows.filter((r) => r.lot.commodityId === l.commodityId).map((r) => ({ lotId: r.lot.id, lotCode: r.lot.code, expiresOn: r.lot.expiresOn, receivedAt: r.receivedAt, available: r.available, status: r.lot.status }));
      for (const p of allocateFefo(eligible, need).picks) next[p.lotId] = p.quantity;
    }
    setPicks(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indent.data, rows.length]);
  const commodities = useMemo(() => [...new Map(rows.map((r) => [r.lot.commodityId, r.lot])).values()], [rows]);
  const create = useMutation({
    mutationFn: () => logistics.create({
      fromFacilityId: from, toFacilityId: to, plannedDispatchAt: new Date(dispatchAt).toISOString(), expectedArrivalAt: new Date(arriveAt).toISOString(), purpose: 'REPLENISHMENT', indentId,
      lines: Object.entries(picks).filter(([, q]) => q > 0).map(([lotId, quantity]) => ({ lotId, quantity })),
    }),
    onSuccess: (s) => { toast.success(`${s.shipmentNo} planned; stock reserved`); navigate(`/logistics/shipments/${s.id}`); },
  });
  const suggest = () => {
    const eligible = rows.filter((r) => r.lot.commodityId === need.commodityId).map((r) => ({ lotId: r.lot.id, lotCode: r.lot.code, expiresOn: r.lot.expiresOn, receivedAt: r.receivedAt, available: r.available, status: r.lot.status }));
    const { picks: p, shortfall } = allocateFefo(eligible, Number(need.qty));
    setPicks((cur) => ({ ...cur, ...Object.fromEntries(p.map((x) => [x.lotId, x.quantity])) }));
    if (shortfall > 0) toast.warning(`Short by ${shortfall}; only usable lots were picked.`);
  };
  const lines = Object.entries(picks).filter(([, q]) => q > 0);
  const invalid = lines.some(([id, q]) => q > (rows.find((r) => r.lot.id === id)?.available ?? 0));
  return (
    <Page className="max-w-5xl">
      <PageHeader back={indent.data ? { to: `/indents/${indent.data.id}`, label: indent.data.indentNo } : { to: '/logistics/shipments', label: 'Shipments' }} title={indent.data ? `Fulfil ${indent.data.indentNo}` : 'Plan a shipment'} description={indent.data ? `Lots were picked first-expiry-first-out for the approved quantities to ${indent.data.requesting.name}. Adjust if needed, then save.` : 'Pick lots first-expiry-first-out. Stock is reserved when you save and leaves the books only when dispatched.'} />
      <Section title="Route">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>From</Label><FacilityPicker value={from} onChange={(id) => { setFrom(id); setPicks({}); }} types={['STATE_WAREHOUSE', 'DISTRICT_WAREHOUSE', 'BLOCK_STORE', 'CENTRAL_KITCHEN']} /></div>
          <div className="space-y-1.5"><Label>To</Label><FacilityPicker value={to} onChange={setTo} exclude={from} /></div>
          <div className="space-y-1.5"><Label htmlFor="pd">Planned dispatch</Label><Input id="pd" type="datetime-local" value={dispatchAt} onChange={(e) => setDispatchAt(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ea">Expected arrival</Label><Input id="ea" type="datetime-local" value={arriveAt} onChange={(e) => setArriveAt(e.target.value)} /></div>
        </div>
      </Section>
      <Section title="Load" description={from ? `${rows.length} lots in stock at origin` : 'Choose the origin to see its stock'}>
        {from && (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md bg-trace-soft/50 p-3">
            <div className="space-y-1.5"><Label>Commodity</Label>
              <Select value={need.commodityId} onValueChange={(v) => setNeed((n) => ({ ...n, commodityId: v }))}><SelectTrigger className="w-56"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{commodities.map((c) => <SelectItem key={c.commodityId} value={c.commodityId}>{c.commodityName}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="need">Quantity needed</Label><Input id="need" type="number" className="w-36" value={need.qty} onChange={(e) => setNeed((n) => ({ ...n, qty: e.target.value }))} /></div>
            <Button variant="trace" onClick={suggest} disabled={!need.commodityId || !Number(need.qty)}><Sparkles /> Pick lots (FEFO)</Button>
          </div>
        )}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Lot</TableHead><TableHead>Commodity</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="w-40 text-right">Ship</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r: StockRowDto) => {
                const blocked = r.lot.status !== 'RELEASED';
                return (
                  <TableRow key={r.id} className={blocked ? 'opacity-60' : undefined}>
                    <TableCell className="code-id text-trace-ink">{r.lot.code}</TableCell>
                    <TableCell>{r.lot.commodityName}</TableCell>
                    <TableCell>{date(r.lot.expiresOn)}</TableCell>
                    <TableCell><StatusBadge kind="lot" value={r.lot.status} /></TableCell>
                    <TableCell className="text-right num">{qty(r.available, r.lot.unit)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Input type="number" step="any" disabled={blocked} className="h-8 w-24 text-right" aria-label={`Quantity of ${r.lot.code}`} value={picks[r.lot.id] ?? ''} onChange={(e) => setPicks((p) => ({ ...p, [r.lot.id]: Number(e.target.value) }))} aria-invalid={(picks[r.lot.id] ?? 0) > r.available || undefined} />
                        <span className="w-6 text-xs text-muted-foreground">{unit(r.lot.unit)}</span>
                        {picks[r.lot.id] ? <Button variant="ghost" size="icon-sm" onClick={() => setPicks(({ [r.lot.id]: _, ...rest }) => rest)} aria-label="Clear"><Trash2 /></Button> : <span className="w-8" />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>
      {invalid && <FormError message="A quantity is more than what is available for that lot." />}
      <div className="flex justify-end"><Button size="lg" disabled={!from || !to || !lines.length || invalid} loading={create.isPending} onClick={() => create.mutate()}>Save and reserve stock</Button></div>
    </Page>
  );
}
