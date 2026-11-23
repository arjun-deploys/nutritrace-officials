import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { SHIPMENT_STATUSES, type ShipmentDto } from '@nt/domain';
import { Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { useTableParams } from '@/hooks/use-table-params';
import { logistics } from '@/lib/api';
import { dateTime, num, qtyShort } from '@/lib/format';
import { statusOf } from '@/config/status';
import { useCan, useUser } from '@/stores/auth';

export const shipmentTotal = (s: ShipmentDto) => Object.entries(s.lines.reduce<Record<string, number>>((a, l) => ({ ...a, [l.unit]: (a[l.unit] ?? 0) + l.dispatchedQty }), {})).map(([u, v]) => qtyShort(v, u)).join(' + ');

export default function ShipmentsPage() {
  const { params, setParam } = useTableParams({ open: 'true' });
  const query = useQuery(logistics.shipments(params));
  const navigate = useNavigate();
  const canCreate = useCan('shipment:create');
  const user = useUser();
  const columns: ColumnDef<ShipmentDto, unknown>[] = [
    { header: 'Shipment', cell: ({ row }) => <div><p className="code-id">{row.original.shipmentNo}</p><p className="text-xs text-muted-foreground">{row.original.origin === 'SUPPLIER' ? 'From supplier' : 'Transfer'}</p></div>, meta: { sortKey: 'shipmentNo' } },
    { header: 'Route', cell: ({ row }) => <div className="max-w-72 text-sm"><p className="truncate">{row.original.from.name}</p><p className="truncate text-muted-foreground">→ {row.original.to.name}</p></div> },
    { header: 'Load', cell: ({ row }) => <span className="text-sm">{row.original.lines.length} lots · {shipmentTotal(row.original)}</span> },
    { header: 'Vehicle', cell: ({ row }) => <span className="text-sm">{row.original.vehicle?.registrationNo ?? '—'}</span> },
    { header: 'Expected', cell: ({ row }) => <span className="text-sm">{dateTime(row.original.expectedArrivalAt)}{row.original.delayHours > 0 && !row.original.receivedAt && <span className="block text-xs text-danger num">{num(row.original.delayHours)} h late</span>}</span>, meta: { sortKey: 'expectedArrivalAt' } },
    { header: 'Status', cell: ({ row }) => <div className="flex items-center gap-1.5"><StatusBadge kind="shipment" value={row.original.status} />{row.original.hasDiscrepancy && <AlertTriangle className="size-4 text-warning" aria-label="Discrepancy" />}</div> },
  ];
  const view = params.discrepancy ? 'discrepancy' : params.direction === 'inbound' ? 'inbound' : params.open ? 'open' : 'all';
  return (
    <Page>
      <PageHeader title="Shipments" description="Every movement of food between supplier, warehouses, kitchens and schools, with its custody hand-offs."
        actions={canCreate && <Button asChild><Link to="/logistics/shipments/new"><Plus /> Plan shipment</Link></Button>} />
      <Tabs value={view} onValueChange={(v) => {
        setParam('open', v === 'open' ? 'true' : undefined);
        setParam('discrepancy', v === 'discrepancy' ? 'true' : undefined);
        setParam('direction', v === 'inbound' ? 'inbound' : undefined);
      }}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          {user.facilityId && <TabsTrigger value="inbound">Coming to me</TabsTrigger>}
          <TabsTrigger value="discrepancy">With discrepancy</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable columns={columns} query={query} params={params} setParam={setParam} searchPlaceholder="Shipment, lot, vehicle or destination"
        filters={[{ key: 'status', label: 'Status', options: SHIPMENT_STATUSES.map((s) => ({ value: s, label: statusOf('shipment', s).label })) }]}
        onRowClick={(s) => navigate(`/logistics/shipments/${s.id}`)}
        rowClassName={(s) => (s.status === 'DELAYED' ? 'bg-danger-soft/30' : undefined)}
        empty={{ title: 'No shipments here', description: 'Planned and dispatched shipments appear here.' }} />
      {(query.data?.meta.total ?? 0) > 0 && <p className="text-xs text-muted-foreground">Tracking shows the last known location. Only a goods receipt at the destination confirms delivery.</p>}
    </Page>
  );
}
