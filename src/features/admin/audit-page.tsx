import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AuditLogDto } from '@nt/domain';
import { ROLE_LABELS } from '@nt/domain';
import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { useTableParams } from '@/hooks/use-table-params';
import { insight } from '@/lib/api';
import { dateTime } from '@/lib/format';

export default function AuditPage() {
  const { params, setParam } = useTableParams({ sort: 'at' });
  const q = useQuery(insight.audit(params));
  const columns: ColumnDef<AuditLogDto, unknown>[] = [
    { header: 'When', cell: ({ row }) => <span className="whitespace-nowrap">{dateTime(row.original.at)}</span>, meta: { sortKey: 'at' } },
    { header: 'Who', cell: ({ row }) => <div><p>{row.original.actor.name}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[row.original.actor.role]}</p></div> },
    { header: 'Action', cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span> },
    { header: 'Record', cell: ({ row }) => <span className="code-id">{row.original.entity.label ?? row.original.entity.id}</span> },
    { header: 'Changes', cell: ({ row }) => <span className="block max-w-md truncate text-xs text-muted-foreground">{row.original.changes?.map((c) => `${c.field}: ${JSON.stringify(c.from) ?? '∅'} → ${JSON.stringify(c.to)}`).join('; ') || '—'}</span> },
    { header: 'Source', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.service}{row.original.ip && ` · ${row.original.ip}`}</span> },
  ];
  return (
    <Page>
      <PageHeader title="Audit trail" description="Append-only record of every approval, decision, configuration change and sign-in, with who, when and what changed." />
      <DataTable columns={columns} query={q} params={params} setParam={setParam} searchPlaceholder="Person or record" dense empty={{ title: 'No audit entries' }} />
    </Page>
  );
}
