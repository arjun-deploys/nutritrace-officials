import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FacilityPicker } from '@/components/shared/facility-picker';
import { LoadingBlock } from '@/components/shared/states';
import { TraceLanes } from './trace-graph';
import { useDebounced } from '@/hooks/use-debounced';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CUSTODY_STAGES, LOT_STATUSES, type LotDto } from '@nt/domain';
import { ScanLine, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { CustodyRibbon, STAGE_LABEL } from '@/components/shared/custody-ribbon';
import { LotLink } from '@/components/shared/links';
import { StatusBadge } from '@/components/shared/status';
import { FormError } from '@/components/shared/form';
import { useTableParams } from '@/hooks/use-table-params';
import { logistics, registry, trace, trips } from '@/lib/api';
import { isApiError } from '@/lib/http';
import { date, num, qtyShort, daysUntil } from '@/lib/format';
import { statusOf } from '@/config/status';
import { cn } from '@/lib/utils';

export default function TracePage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('view') ?? 'lots';
  return (
    <Page>
      <PageHeader title="Track & trace" description="Follow a lot forward to the schools and meals it reached, trace a school's food back to its source, or track a shipment and trip." />
      <Tabs value={tab} onValueChange={(v) => setSp(new URLSearchParams({ view: v }))}>
        <TabsList><TabsTrigger value="lots">Lots</TabsTrigger><TabsTrigger value="school">A school's food</TabsTrigger><TabsTrigger value="movement">Shipments & trips</TabsTrigger></TabsList>
      </Tabs>
      {tab === 'lots' && <LotsTrace />}
      {tab === 'school' && <SchoolTrace />}
      {tab === 'movement' && <MovementTrace />}
    </Page>
  );
}

function LotsTrace() {
  const navigate = useNavigate();
  const { params, setParam } = useTableParams({ sort: 'createdAt' });
  const lots = useQuery(trace.lots(params));
  const commodities = useQuery(registry.commodities());
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const verify = useQuery(trace.verify());
  const resolve = useMutation({
    mutationFn: (c: string) => trace.resolve(c),
    meta: { silent: true },
    onSuccess: (r) => navigate(`/trace/lots/${r.id}`),
    onError: (e) => setError(isApiError(e) && e.status === 404 ? `No lot matches “${code}”. Check the code on the bag label.` : 'Lookup failed. Try again.'),
  });

  const columns: ColumnDef<LotDto, unknown>[] = [
    { header: 'Lot', cell: ({ row }) => <LotLink id={row.original.id} code={row.original.code} />, meta: { sortKey: 'code' } },
    { header: 'Commodity', cell: ({ row }) => row.original.commodity.name },
    { header: 'Supplier', cell: ({ row }) => <span className="block max-w-48 truncate">{row.original.supplier.name}</span> },
    { header: 'Quantity', cell: ({ row }) => qtyShort(row.original.quantity, row.original.commodity.unit), meta: { align: 'right', sortKey: 'quantity' } },
    { header: 'Custody reached', cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <CustodyRibbon current={row.original.currentStage} flagged={['RECALLED', 'ON_HOLD', 'REJECTED'].includes(row.original.status)} />
        <span className="text-xs text-muted-foreground">{STAGE_LABEL[row.original.currentStage]}</span>
      </div>
    ) },
    { header: 'Expires', cell: ({ row }) => {
      const d = daysUntil(row.original.expiresOn);
      return <span className={cn(d < 0 ? 'text-danger' : d < 30 && 'text-warning')}>{date(row.original.expiresOn)}</span>;
    }, meta: { sortKey: 'expiresOn' } },
    { header: 'Record complete', cell: ({ row }) => (row.original.completeness ? `${row.original.completeness}%` : '—'), meta: { align: 'right', sortKey: 'completeness' } },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="lot" value={row.original.status} /> },
  ];

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Trace a lot" description="Enter the lot code from the bag label or QR sticker, or the supplier's own lot number.">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setError(undefined); if (code.trim().length >= 3) resolve.mutate(code.trim()); }}>
            <div className="relative flex-1">
              <ScanLine className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-trace" aria-hidden />
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. RICE-TN-2611-00007" className="h-11 pl-10 text-base code-id uppercase" aria-label="Lot code" autoCapitalize="characters" />
            </div>
            <Button type="submit" size="lg" variant="trace" loading={resolve.isPending}>Trace</Button>
          </form>
          <div className="mt-3"><FormError message={error} /></div>
        </Section>
        <Section title="Ledger integrity" description="Every custody event is chained to the one before it with a SHA-256 hash. Any edit breaks the chain.">
          {verify.data ? (
            <div className="flex items-start gap-3">
              {verify.data.verified ? <ShieldCheck className="size-8 shrink-0 text-success" /> : <ShieldAlert className="size-8 shrink-0 text-danger" />}
              <div className="text-sm">
                <p className="font-medium">{verify.data.verified ? 'Chain intact' : `Chain broken at event ${verify.data.brokenAtSeq}`}</p>
                <p className="text-muted-foreground num">{num(verify.data.eventsChecked)} events verified · head {verify.data.headHash.slice(0, 12)}…</p>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => verify.refetch()} loading={verify.isFetching}><ShieldCheck /> Verify the full ledger now</Button>
          )}
        </Section>
      </div>
      <DataTable
        columns={columns}
        query={lots}
        params={params}
        setParam={setParam}
        searchPlaceholder="Lot, supplier lot or PO number"
        filters={[
          { key: 'status', label: 'Status', options: LOT_STATUSES.map((s) => ({ value: s, label: statusOf('lot', s).label })) },
          { key: 'commodityId', label: 'Commodity', options: (commodities.data ?? []).map((c) => ({ value: c.id, label: c.name })) },
          { key: 'stage', label: 'Stage', options: CUSTODY_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })) },
        ]}
        onRowClick={(l) => navigate(`/trace/lots/${l.id}`)}
        empty={{ title: 'No lots match', description: 'Lots appear here when a supplier dispatches against a purchase order.' }}
      />
    </>
  );
}

function SchoolTrace() {
  const [schoolId, setSchoolId] = useState('');
  const [days, setDays] = useState('14');
  const from = new Date(Date.now() - Number(days) * 86_400_000).toLocaleDateString('en-CA');
  const src = useQuery(trace.sources(schoolId, from, new Date().toLocaleDateString('en-CA')));
  return (
    <div className="space-y-6">
      <Section title="Where did a school's food come from?" description="Choose a school to see every lot cooked into its meals, the supplier of each, and the stores it passed through.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-md"><FacilityPicker value={schoolId} onChange={setSchoolId} types={['SCHOOL']} placeholder="Search school by name or UDISE+" /></div>
          <Select value={days} onValueChange={setDays}><SelectTrigger className="w-40" aria-label="Period"><SelectValue /></SelectTrigger><SelectContent>{['7', '14', '30'].map((d) => <SelectItem key={d} value={d}>Last {d} days</SelectItem>)}</SelectContent></Select>
          {schoolId && <Button asChild variant="outline"><Link to={`/schools/${schoolId}`}>Open school</Link></Button>}
        </div>
      </Section>
      {schoolId && (src.isPending ? <LoadingBlock rows={4} /> : src.data && (
        <Section title={`${num(src.data.mealsServed)} meals over ${src.data.days} days used ${src.data.usage.length} lots`}>
          <ul className="mb-6 divide-y rounded-md border">
            {src.data.usage.map((u) => <li key={u.lot.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm"><span className="flex items-center gap-3"><LotLink id={u.lot.id} code={u.lot.code} />{u.lot.commodity.name}</span><span className="text-muted-foreground">{u.lot.supplier.name}</span></li>)}
          </ul>
          <TraceLanes graph={src.data.graph} emptyText="No meals linked to lots in this period." />
        </Section>
      ))}
    </div>
  );
}

function MovementTrace() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const ships = useQuery({ ...logistics.shipments({ q: dq, pageSize: 10 }), enabled: dq.length >= 2 });
  const tr = useQuery(trips.list({ pageSize: 10, sort: 'plannedStartAt' }));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Find a shipment" description="Shipment number, lot code, vehicle or destination.">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. SHP-TN-2611-00235 or TN09AB1234" aria-label="Find a shipment" />
        <ul className="mt-3 divide-y">
          {(ships.data?.data ?? []).map((s) => <li key={s.id}><button type="button" onClick={() => navigate(`/logistics/shipments/${s.id}`)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-accent"><span className="code-id">{s.shipmentNo}</span><span className="min-w-0 flex-1 truncate">{s.from.name} → {s.to.name}</span><StatusBadge kind="shipment" value={s.status} /></button></li>)}
        </ul>
      </Section>
      <Section title="Recent trips" bodyClassName="p-0">
        <ul className="divide-y">
          {(tr.data?.data ?? []).map((t) => <li key={t.id}><button type="button" onClick={() => navigate(`/last-mile/trips/${t.id}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-accent"><span className="code-id">{t.tripNo}</span><span className="min-w-0 flex-1 truncate">{t.origin.name} · {t.stops.length} schools</span><span className="text-xs num">{t.progress.delivered}/{t.progress.total}</span><StatusBadge kind="trip" value={t.status} /></button></li>)}
          {!tr.data?.data.length && <li className="px-5 py-6 text-center text-sm text-muted-foreground">No trips yet.</li>}
        </ul>
      </Section>
    </div>
  );
}
