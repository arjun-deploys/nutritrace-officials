import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { SupplierDto } from '@nt/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Page, PageHeader, Section, DetailList } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { QueryBoundary, LoadingBlock } from '@/components/shared/states';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { useTableParams } from '@/hooks/use-table-params';
import { procurement, registry, trace } from '@/lib/api';
import { date, daysUntil, qtyShort } from '@/lib/format';
import { useCan } from '@/stores/auth';
import { CustodyRibbon } from '@/components/shared/custody-ribbon';
import { LotLink } from '@/components/shared/links';
import { toast } from 'sonner';
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { SupplierDialog } from './supplier-form';
import { ExchangeActions } from '@/admin/components/exchange';

const licenceBadge = (d: string) => {
  const n = daysUntil(d);
  return n < 0 ? <Badge tone="danger">Expired</Badge> : n < 60 ? <Badge tone="warning">Expires in {n} d</Badge> : <span className="text-sm">{date(d)}</span>;
};

export default function SuppliersPage() {
  const { params, setParam } = useTableParams({ sort: 'name', order: 'asc' });
  const query = useQuery(registry.suppliers(params));
  const commodities = useQuery(registry.commodities());
  const navigate = useNavigate();
  const name = (id: string) => commodities.data?.find((c) => c.id === id)?.name.split(' ')[0] ?? '';
  const canAdd = useCan('supplier:manage');
  const [adding, setAdding] = useState(false);
  const columns: ColumnDef<SupplierDto, unknown>[] = [
    { header: 'Supplier', cell: ({ row }) => <div><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.code} · GSTIN {row.original.gstin}</p></div>, meta: { sortKey: 'name' } },
    { header: 'Supplies', cell: ({ row }) => <span className="text-sm">{row.original.commodityIds.map(name).join(', ')}</span> },
    { header: 'FSSAI licence', cell: ({ row }) => licenceBadge(row.original.fssaiValidUntil) },
    { header: 'Contact', cell: ({ row }) => <span className="text-sm">{row.original.contact.name} · {row.original.contact.phone}</span> },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="supplier" value={row.original.status} /> },
  ];
  return (
    <Page>
      <PageHeader title="Suppliers" description="Approved sources of food. Licence validity is checked before every order and approval." actions={<><ExchangeActions entity="suppliers" invalidate={['suppliers']} />{canAdd && <Button onClick={() => setAdding(true)}><Plus /> Register supplier</Button>}</>} />
      <SupplierDialog open={adding} onClose={() => setAdding(false)} />
      <DataTable columns={columns} query={query} params={params} setParam={setParam} searchPlaceholder="Name, code or GSTIN"
        filters={[{ key: 'status', label: 'Status', options: [{ value: 'APPROVED', label: 'Approved' }, { value: 'PENDING_VERIFICATION', label: 'Pending verification' }, { value: 'SUSPENDED', label: 'Suspended' }] }]}
        onRowClick={(s) => navigate(`/procurement/suppliers/${s.id}`)} />
    </Page>
  );
}

export function SupplierDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const s = useQuery(registry.supplier(id));
  const perf = useQuery(procurement.performance(id));
  const lots = useQuery(trace.lots({ supplierId: id, pageSize: 10 }));
  const canManage = useCan('master:manage');
  const canEdit = useCan('supplier:manage');
  const [editing, setEditing] = useState(false);
  const status = useMutation({
    mutationFn: (v: { status: 'APPROVED' | 'SUSPENDED'; reason: string }) => registry.supplierStatus(id, v),
    onSuccess: () => { toast.success('Supplier status updated'); void qc.invalidateQueries({ queryKey: ['supplier', id] }); },
  });
  return (
    <QueryBoundary query={s} loading={<Page><LoadingBlock /></Page>}>{(sup) => (
      <Page>
        <PageHeader back={{ to: '/procurement/suppliers', label: 'Suppliers' }} title={sup.name} description={sup.address} meta={<StatusBadge kind="supplier" value={sup.status} />}
          actions={<>{canEdit && <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}{canManage && (sup.status === 'APPROVED'
            ? <ReasonDialog trigger={<Button variant="outline">Suspend</Button>} title={`Suspend ${sup.name}`} description="No new orders can be raised while suspended." confirmLabel="Suspend" destructive onConfirm={(reason) => status.mutateAsync({ status: 'SUSPENDED', reason })} />
            : <ReasonDialog trigger={<Button>Approve</Button>} title={`Approve ${sup.name}`} confirmLabel="Approve" onConfirm={(reason) => status.mutateAsync({ status: 'APPROVED', reason })} />)}</>} />
        <SupplierDialog open={editing} supplier={sup} onClose={() => setEditing(false)} />
        {perf.data && <KpiStrip kpis={[
          { key: 'ot', label: 'On-time dispatches', value: perf.data.onTimePct, unit: '%' },
          { key: 'if', label: 'Accepted of ordered', value: perf.data.inFullPct, unit: '%' },
          { key: 'q', label: 'Accepted of received', value: perf.data.qualityPassPct, unit: '%' },
          { key: 'o', label: 'Orders', value: perf.data.orders },
          { key: 'l', label: 'Lots supplied', value: perf.data.lotsSupplied },
        ]} />}
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Section title="Registration">
            <DetailList columns={1} items={[
              { label: 'GSTIN', value: sup.gstin },
              { label: 'FSSAI licence', value: <>{sup.fssaiLicence} · {licenceBadge(sup.fssaiValidUntil)}</> },
              { label: 'Contact', value: `${sup.contact.name}, ${sup.contact.phone}` },
            ]} />
          </Section>
          <Section title="Recent lots" bodyClassName="p-0">
            <ul className="divide-y">
              {lots.isPending && <li className="p-4"><LoadingBlock rows={3} /></li>}
              {lots.data?.data.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <LotLink id={l.id} code={l.code} />
                  <span className="text-muted-foreground num">{qtyShort(l.quantity, l.commodity.unit)}</span>
                  <CustodyRibbon current={l.currentStage} flagged={l.status === 'RECALLED'} />
                  <StatusBadge kind="lot" value={l.status} />
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </Page>
    )}</QueryBoundary>
  );
}
