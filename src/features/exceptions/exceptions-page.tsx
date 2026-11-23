import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { EXCEPTION_TYPES, ROLE_LABELS, SEVERITIES, type ExceptionDto, type Role } from '@nt/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader, DetailList } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { Timeline } from '@/components/shared/timeline';
import { LoadingBlock } from '@/components/shared/states';
import { useTableParams } from '@/hooks/use-table-params';
import { insight } from '@/lib/api';
import { ago, dateTime, num } from '@/lib/format';
import { EXCEPTION_LABEL, statusOf } from '@/config/status';
import { useCan } from '@/stores/auth';
import { toast } from 'sonner';

const ENTITY_LINK: Record<string, (id: string) => string> = {
  LOT: (id) => `/trace/lots/${id}`, SHIPMENT: (id) => `/logistics/shipments/${id}`, SCHOOL: (id) => `/schools/${id}`, RECALL: (id) => `/quality/recalls/${id}`,
};

export default function ExceptionsPage() {
  const { params, setParam } = useTableParams({ status: 'open' });
  const [sp, setSp] = useSearchParams();
  const openId = sp.get('open');
  const query = useQuery(insight.exceptions({ ...params, open: params.status === 'open' ? true : undefined, status: params.status === 'open' ? undefined : params.status }));

  const columns: ColumnDef<ExceptionDto, unknown>[] = [
    { header: 'Severity', cell: ({ row }) => <StatusBadge kind="severity" value={row.original.severity} />, meta: { sortKey: 'severity' } },
    { header: 'Issue', cell: ({ row }) => (
      <div className="max-w-[46ch]">
        <p className="font-medium">{row.original.title}</p>
        <p className="text-xs text-muted-foreground">{row.original.exceptionNo} · {EXCEPTION_LABEL[row.original.type]}</p>
      </div>
    ) },
    { header: 'Where', cell: ({ row }) => <span className="block max-w-48 truncate">{row.original.facility?.name ?? '—'}</span> },
    { header: 'Owner', cell: ({ row }) => <span className="text-sm">{ROLE_LABELS[row.original.owner?.role as Role] ?? '—'}</span> },
    { header: 'Age', cell: ({ row }) => <span className="num">{row.original.ageHours < 24 ? `${num(row.original.ageHours)} h` : `${num(row.original.ageHours / 24)} d`}</span>, meta: { align: 'right', sortKey: 'createdAt' } },
    { header: 'Due', cell: ({ row }) => row.original.status === 'RESOLVED' ? <span className="text-muted-foreground">—</span> : row.original.overdue ? <Badge tone="danger">Overdue</Badge> : <span className="text-sm">{ago(row.original.dueAt).replace(' ago', '')} left</span>, meta: { sortKey: 'dueAt' } },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="exception" value={row.original.status} /> },
  ];

  return (
    <Page>
      <PageHeader title="Exceptions" description="Problems the rule engine has found, routed to the role that can fix them. Every action is logged." />
      <Tabs value={String(params.status ?? 'open')} onValueChange={(v) => setParam('status', v)}>
        <TabsList><TabsTrigger value="open">Open</TabsTrigger><TabsTrigger value="RESOLVED">Resolved</TabsTrigger><TabsTrigger value="all">All</TabsTrigger></TabsList>
      </Tabs>
      <DataTable
        columns={columns} query={query} params={params} setParam={setParam} searchPlaceholder="Search titles"
        filters={[
          { key: 'severity', label: 'Severity', options: SEVERITIES.map((s) => ({ value: s, label: statusOf('severity', s).label })) },
          { key: 'type', label: 'Type', options: EXCEPTION_TYPES.map((t) => ({ value: t, label: EXCEPTION_LABEL[t] ?? t })) },
        ]}
        onRowClick={(e) => setSp((p) => { p.set('open', e.id); return p; })}
        rowClassName={(e) => (e.severity === 'CRITICAL' && e.status !== 'RESOLVED' ? 'bg-danger-soft/30' : undefined)}
        empty={{ title: 'Nothing needs attention', description: 'No exceptions match these filters.' }}
      />
      <ExceptionSheet id={openId} onClose={() => setSp((p) => { p.delete('open'); return p; })} />
    </Page>
  );
}

function ExceptionSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const canManage = useCan('exception:manage');
  const q = useQuery({ ...insight.exception(id ?? ''), enabled: !!id });
  const act = useMutation({
    mutationFn: ({ action, note }: { action: 'ACKNOWLEDGE' | 'RESOLVE' | 'ESCALATE' | 'REOPEN'; note: string }) => insight.act(id!, { action, note }),
    onSuccess: (e) => { toast.success(`${e.exceptionNo} ${statusOf('exception', e.status).label.toLowerCase()}`); void qc.invalidateQueries({ queryKey: ['exceptions'] }); void qc.invalidateQueries({ queryKey: ['exception', id] }); },
  });
  const e = q.data;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {!e ? <div className="p-6"><LoadingBlock /></div> : (
          <>
            <SheetHeader>
              <div className="flex gap-2"><StatusBadge kind="severity" value={e.severity} /><StatusBadge kind="exception" value={e.status} /></div>
              <SheetTitle className="text-lg">{e.title}</SheetTitle>
              <SheetDescription>{e.detail}</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-6">
              <DetailList columns={2} items={[
                { label: 'Reference', value: e.exceptionNo },
                { label: 'Type', value: EXCEPTION_LABEL[e.type] },
                { label: 'Facility', value: e.facility?.name },
                { label: 'Owner', value: ROLE_LABELS[e.owner?.role as Role] },
                { label: 'Raised', value: dateTime(e.createdAt) },
                { label: 'Due by', value: dateTime(e.dueAt) },
              ]} />
              {e.entity && ENTITY_LINK[e.entity.kind] && <Button asChild variant="outline" className="w-full"><Link to={ENTITY_LINK[e.entity.kind]!(e.entity.id)}>Open {e.entity.label}</Link></Button>}
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  {e.status === 'OPEN' && <ReasonDialog trigger={<Button variant="outline">Acknowledge</Button>} title="Acknowledge" description="Confirms someone is working on it." confirmLabel="Acknowledge" minLength={3} onConfirm={(note) => act.mutateAsync({ action: 'ACKNOWLEDGE', note })} pending={act.isPending} />}
                  {e.status !== 'RESOLVED' && <ReasonDialog trigger={<Button>Resolve</Button>} title="Resolve exception" description="Describe what was done. Resolution is reviewed in audits." confirmLabel="Resolve" onConfirm={(note) => act.mutateAsync({ action: 'RESOLVE', note })} pending={act.isPending} />}
                  {e.status !== 'RESOLVED' && <ReasonDialog trigger={<Button variant="ghost">Escalate</Button>} title="Escalate" description="Moves ownership one level up and raises severity." confirmLabel="Escalate" onConfirm={(note) => act.mutateAsync({ action: 'ESCALATE', note })} pending={act.isPending} />}
                  {e.status === 'RESOLVED' && <ReasonDialog trigger={<Button variant="outline">Reopen</Button>} title="Reopen" confirmLabel="Reopen" onConfirm={(note) => act.mutateAsync({ action: 'REOPEN', note })} pending={act.isPending} />}
                </div>
              )}
              <div>
                <h3 className="mb-3 text-sm font-semibold">History</h3>
                <Timeline items={[...e.log].reverse().map((l, i) => ({ key: String(i), title: l.action.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), at: dateTime(l.at), meta: l.by.name, body: l.note }))} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
