import { useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { SchoolDayStatusDto } from '@nt/domain';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { useScopePath } from '@/app/layouts/scope-switcher';
import { insight, meals } from '@/lib/api';
import { num, today, humanize } from '@/lib/format';
import { MEAL_LABEL } from '@/config/status';
import { useCan, useUser } from '@/stores/auth';

export default function SchoolsPage() {
  const user = useUser();
  if (user.facilityId && user.role === 'SCHOOL_HEAD') return <Navigate to={`/schools/${user.facilityId}`} replace />;
  return <SchoolsStatus />;
}

function SchoolsStatus() {
  const geoPath = useScopePath();
  const [day, setDay] = useState(today());
  const [view, setView] = useState<'pending' | 'all' | 'interrupted'>('pending');
  const [search, setSearch] = useState('');
  const canExport = useCan('report:export');
  const navigate = useNavigate();
  const q = useQuery(meals.status({ date: day, geoPath }));
  const rows = useMemo(() => {
    const all = q.data ?? [];
    const s = search.trim().toLowerCase();
    return all
      .filter((r) => view === 'all' || r.meals.some((m) => m.status === (view === 'pending' ? 'PENDING' : 'INTERRUPTED')))
      .filter((r) => !s || r.school.name.toLowerCase().includes(s) || r.blockName?.toLowerCase().includes(s));
  }, [q.data, view, search]);
  const slots = (q.data ?? []).flatMap((r) => r.meals);
  const reported = slots.filter((m) => m.status !== 'PENDING').length;
  const served = slots.reduce((a, m) => a + (m.served ?? 0), 0);
  const present = slots.reduce((a, m) => a + (m.present ?? 0), 0);
  const mealTypes = [...new Set(slots.map((m) => m.mealType))];
  const columns: ColumnDef<SchoolDayStatusDto, unknown>[] = [
    { header: 'School', cell: ({ row }) => <div><p className="font-medium">{row.original.school.name}</p><p className="text-xs text-muted-foreground">{row.original.blockName} · {row.original.districtName} · {humanize(row.original.category)}</p></div> },
    { header: 'Enrolled', cell: ({ row }) => num(row.original.enrolment), meta: { align: 'right' } },
    ...mealTypes.map<ColumnDef<SchoolDayStatusDto, unknown>>((mt) => ({
      id: mt,
      header: MEAL_LABEL[mt],
      cell: ({ row }) => {
        const m = row.original.meals.find((x) => x.mealType === mt);
        if (!m) return <span className="text-muted-foreground">—</span>;
        return m.status === 'REPORTED' ? <span className="text-sm num">{num(m.served ?? 0)} <span className="text-muted-foreground">of {num(m.present ?? 0)}</span></span> : <StatusBadge kind="service" value={m.status} />;
      },
    })),
  ];
  return (
    <Page>
      <PageHeader title="Schools" description="Which schools have reported today's meals, and how many children present were served."
        actions={<>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">Day<Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} className="w-40" /></label>
          {canExport && <Button variant="outline" onClick={() => void insight.exportReport('meal-service', { from: day, to: day, geoPath })}><Download /> Export day</Button>}
        </>} />
      <KpiStrip kpis={[
        { key: 'schools', label: 'Schools', value: q.data?.length ?? 0 },
        { key: 'rep', label: 'Meal reports received', value: slots.length ? Math.round((reported / slots.length) * 1000) / 10 : 0, unit: '%', hint: `${reported} of ${slots.length}` },
        { key: 'pending', label: 'Still to report', value: slots.length - reported, higherIsBetter: false },
        { key: 'served', label: 'Meals served', value: served },
        { key: 'fed', label: 'Fed of present', value: present ? Math.round((served / present) * 1000) / 10 : 0, unit: '%' },
      ]} />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList><TabsTrigger value="pending">Not reported</TabsTrigger><TabsTrigger value="interrupted">Interrupted</TabsTrigger><TabsTrigger value="all">All schools</TabsTrigger></TabsList>
        </Tabs>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="School or block" className="w-64" aria-label="Filter schools" />
      </div>
      <DataTable columns={columns} rows={rows} loading={q.isPending} onRowClick={(r) => navigate(`/schools/${r.school.id}`)} getRowId={(r) => r.school.id}
        empty={{ title: view === 'pending' ? 'Every school has reported' : 'No schools match' }} />
    </Page>
  );
}
