import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { PO_STATUSES, type PoDto } from '@nt/domain';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { Progress } from '@/components/ui/progress';
import { useTableParams } from '@/hooks/use-table-params';
import { procurement } from '@/lib/api';
import { date } from '@/lib/format';
import { statusOf } from '@/config/status';
import { useCan } from '@/stores/auth';

const fulfilment = (po: PoDto) => {
  const ordered = po.lines.reduce((a, l) => a + l.quantity, 0);
  return ordered ? Math.round((po.lines.reduce((a, l) => a + l.accepted, 0) / ordered) * 100) : 0;
};

export default function OrdersPage() {
  const { params, setParam } = useTableParams();
  const query = useQuery(procurement.orders(params));
  const navigate = useNavigate();
  const canCreate = useCan('po:create');
  const columns: ColumnDef<PoDto, unknown>[] = [
    { header: 'Order', cell: ({ row }) => <span className="code-id">{row.original.poNumber}</span>, meta: { sortKey: 'poNumber' } },
    { header: 'Supplier', cell: ({ row }) => <span className="block max-w-56 truncate">{row.original.supplier.name}</span> },
    { header: 'Deliver to', cell: ({ row }) => <span className="block max-w-56 truncate">{row.original.deliverTo.name}</span> },
    { header: 'Commodities', cell: ({ row }) => <span className="text-sm">{row.original.lines.map((l) => l.commodityName.split(' ')[0]).join(', ')}</span> },
    { header: 'Due', cell: ({ row }) => date(row.original.expectedDeliveryDate), meta: { sortKey: 'expectedDeliveryDate' } },
    { header: 'Accepted', cell: ({ row }) => { const f = fulfilment(row.original); return <div className="flex w-28 items-center gap-2"><Progress value={f} /><span className="w-9 text-right text-xs num">{f}%</span></div>; } },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="po" value={row.original.status} /> },
  ];
  return (
    <Page>
      <PageHeader
        title="Purchase orders"
        description="Orders to approved suppliers. Each order is reconciled line by line: ordered, dispatched, received, accepted and rejected."
        actions={canCreate && <Button asChild><Link to="/procurement/orders/new"><Plus /> New order</Link></Button>}
      />
      <DataTable columns={columns} query={query} params={params} setParam={setParam} searchPlaceholder="Order number, supplier or contract"
        filters={[{ key: 'status', label: 'Status', options: PO_STATUSES.map((s) => ({ value: s, label: statusOf('po', s).label })) }]}
        onRowClick={(po) => navigate(`/procurement/orders/${po.id}`)} empty={{ title: 'No purchase orders yet' }} />
    </Page>
  );
}
