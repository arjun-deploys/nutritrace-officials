import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FACILITY_TYPES, type FacilityDto } from '@nt/domain';
import { Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { useTableParams } from '@/hooks/use-table-params';
import { registry } from '@/lib/api';
import { humanize, num } from '@/lib/format';
import { useCan } from '@/stores/auth';
import { FacilityDialog } from './facility-form';
import { ExchangeActions } from '@/admin/components/exchange';

export default function FacilitiesPage() {
  const { params, setParam } = useTableParams({ sort: 'name', order: 'asc' });
  const q = useQuery(registry.facilities(params));
  const navigate = useNavigate();
  const canManage = useCan('master:manage');
  const [editing, setEditing] = useState<FacilityDto | 'new'>();
  const columns: ColumnDef<FacilityDto, unknown>[] = [
    { header: 'Facility', cell: ({ row }) => <div><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.code}{row.original.school && ` · UDISE+ ${row.original.school.udiseCode}`}</p></div>, meta: { sortKey: 'name' } },
    { header: 'Type', cell: ({ row }) => humanize(row.original.type), meta: { sortKey: 'type' } },
    { header: 'District', cell: ({ row }) => row.original.districtName },
    { header: 'Block', cell: ({ row }) => row.original.blockName ?? '—' },
    { header: 'Enrolment / capacity', cell: ({ row }) => (row.original.school ? `${num(row.original.school.enrolment)} children` : row.original.storageCapacityKg ? `${num(row.original.storageCapacityKg / 1000)} t` : '—'), meta: { align: 'right' } },
    { header: 'In charge', cell: ({ row }) => <span className="text-sm">{row.original.inCharge?.name ?? '—'}</span> },
    { header: 'Status', cell: ({ row }) => <Badge tone={row.original.active ? 'success' : 'neutral'}>{row.original.active ? 'Active' : 'Inactive'}</Badge> },
    ...(canManage ? [{ id: 'edit', header: '', cell: ({ row }) => <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(row.original); }}><Pencil /> Edit</Button> } as ColumnDef<FacilityDto, unknown>] : []),
  ];
  return (
    <Page>
      <PageHeader title="Facilities" description="Warehouses, stores, kitchens and schools, mapped to the state's areas. School identity comes from UDISE+."
        actions={canManage && <>
          <ExchangeActions entity="facilities" invalidate={['facilities']} />
          <Button onClick={() => setEditing('new')}><Plus /> Add facility</Button>
        </>} />
      <DataTable columns={columns} query={q} params={params} setParam={setParam} searchPlaceholder="Name, code or UDISE+ code"
        filters={[{ key: 'type', label: 'Type', options: FACILITY_TYPES.map((t) => ({ value: t, label: humanize(t) })) }]}
        onRowClick={(f) => (f.type === 'SCHOOL' ? navigate(`/schools/${f.id}`) : navigate(`/inventory?tab=lots&facilityId=${f.id}`))} />
      <FacilityDialog open={!!editing} facility={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />
    </Page>
  );
}
