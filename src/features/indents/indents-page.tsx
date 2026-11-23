import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { INDENT_STATUSES, type IndentDto } from '@nt/domain';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { useTableParams } from '@/hooks/use-table-params';
import { indents } from '@/lib/api';
import { date, daysUntil } from '@/lib/format';
import { statusOf } from '@/config/status';
import { useCan, useUser } from '@/stores/auth';
import { cn } from '@/lib/utils';

/** StaTwig pull model: outbound = what we asked for, inbound = what others ask us to supply. */
export default function IndentsPage() {
  const user = useUser();
  const { params, setParam } = useTableParams({ direction: user.facilityId ? (user.role === 'SCHOOL_HEAD' || user.role === 'KITCHEN_MANAGER' ? 'outbound' : 'inbound') : undefined, open: 'true' });
  const q = useQuery(indents.list(params));
  const navigate = useNavigate();
  const canCreate = useCan('indent:create');
  const pct = (i: IndentDto) => { const a = i.lines.reduce((x, l) => x + (l.approved || l.requested), 0); return a ? Math.round((i.lines.reduce((x, l) => x + l.shipped, 0) / a) * 100) : 0; };
  const columns: ColumnDef<IndentDto, unknown>[] = [
    { header: 'Indent', cell: ({ row }) => <span className="code-id">{row.original.indentNo}</span>, meta: { sortKey: 'indentNo' } },
    { header: 'Requested by', cell: ({ row }) => <span className="block max-w-56 truncate">{row.original.requesting.name}</span> },
    { header: 'Supplied by', cell: ({ row }) => <span className="block max-w-56 truncate">{row.original.supplying.name}</span> },
    { header: 'Products', cell: ({ row }) => <span className="text-sm">{row.original.lines.map((l) => l.commodityName.split(' ')[0]).join(', ')}</span> },
    { header: 'Needed by', cell: ({ row }) => { const d = daysUntil(row.original.neededBy); const open = ['SUBMITTED', 'APPROVED', 'PARTIALLY_FULFILLED'].includes(row.original.status); return <span className={cn(open && d < 0 && 'font-medium text-danger', open && d >= 0 && d <= 2 && 'text-warning')}>{date(row.original.neededBy)}</span>; }, meta: { sortKey: 'neededBy' } },
    { header: 'Shipped', cell: ({ row }) => <div className="flex w-28 items-center gap-2"><Progress value={pct(row.original)} /><span className="w-9 text-right text-xs num">{pct(row.original)}%</span></div> },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="indent" value={row.original.status} /> },
  ];
  const tab = params.direction ?? 'all';
  return (
    <Page>
      <PageHeader title="Indents" description="Requests for stock from the level above. The supplying store approves the quantities and fulfils them with a shipment; the receipt closes the loop."
        actions={canCreate && <Button asChild><Link to="/indents/new"><Plus /> Raise indent</Link></Button>} />
      <div className="flex flex-wrap items-center gap-3">
        {user.facilityId && (
          <Tabs value={String(tab)} onValueChange={(v) => setParam('direction', v === 'all' ? undefined : v)}>
            <TabsList><TabsTrigger value="inbound">Inbound — to supply</TabsTrigger><TabsTrigger value="outbound">Outbound — we asked</TabsTrigger><TabsTrigger value="all">All</TabsTrigger></TabsList>
          </Tabs>
        )}
        <Tabs value={params.open ? 'open' : 'all'} onValueChange={(v) => setParam('open', v === 'open' ? 'true' : undefined)}>
          <TabsList><TabsTrigger value="open">Open</TabsTrigger><TabsTrigger value="all">All</TabsTrigger></TabsList>
        </Tabs>
      </div>
      <DataTable columns={columns} query={q} params={params} setParam={setParam} searchPlaceholder="Indent number or facility"
        filters={[{ key: 'status', label: 'Status', options: INDENT_STATUSES.map((s) => ({ value: s, label: statusOf('indent', s).label })) }]}
        onRowClick={(i) => navigate(`/indents/${i.id}`)} empty={{ title: 'No indents here', description: canCreate ? 'Raise an indent when you need stock from the store above you.' : undefined }} />
    </Page>
  );
}
