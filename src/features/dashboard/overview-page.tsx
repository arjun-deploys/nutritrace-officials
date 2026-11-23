import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AreaPerformanceDto, ExceptionDto } from '@nt/domain';
import { ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { QueryBoundary, LoadingBlock } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { DataTable } from '@/components/data-table/data-table';
import { Funnel } from '@/components/charts/funnel';
import { ServedTrend } from '@/components/charts/trend-chart';
import { useScopePath } from '@/app/layouts/scope-switcher';
import { insight } from '@/lib/api';
import { ago, date, num, pct, qtyShort, today } from '@/lib/format';
import { EXCEPTION_LABEL } from '@/config/status';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const tone = (v: number, good: number, warn: number, higher = true) =>
  higher ? (v >= good ? 'text-success' : v >= warn ? 'text-warning' : 'text-danger') : v <= good ? 'text-success' : v <= warn ? 'text-warning' : 'text-danger';

/** Field roles land on their own work screen; everyone else on the command centre. */
export default function OverviewPage() {
  const user = useAuthStore((s) => s.user!);
  if (user.role === 'SCHOOL_HEAD' && user.facilityId) return <Navigate to={`/schools/${user.facilityId}`} replace />;
  if (user.role === 'KITCHEN_MANAGER') return <Navigate to="/kitchen" replace />;
  if (user.role === 'DISTRICT_ADMIN') return <Navigate to="/admin" replace />;
  if (['WAREHOUSE_OPERATOR', 'TRANSPORT_COORDINATOR', 'PROCUREMENT_OFFICER', 'QUALITY_INSPECTOR', 'NUTRITIONIST'].includes(user.role)) return <Navigate to="/work" replace />;
  return <CommandCentre />;
}

function CommandCentre() {
  const geoPath = useScopePath();
  const [day, setDay] = useState(today());
  const setGeo = useUiStore((s) => s.setGeoPath);
  const navigate = useNavigate();
  const overview = useQuery(insight.overview({ geoPath, date: day }));
  const areas = useQuery(insight.areas({ geoPath, date: day }));
  const exceptions = useQuery(insight.exceptions({ open: true, pageSize: 6, sort: 'createdAt', geoPath }));

  const areaColumns: ColumnDef<AreaPerformanceDto, unknown>[] = [
    { header: 'Area', accessorKey: 'name', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { header: 'Schools', accessorKey: 'schools', meta: { align: 'right' } },
    { header: 'Reported', cell: ({ row }) => <span className={tone(row.original.reportingPct, 95, 80)}>{pct(row.original.reportingPct)}</span>, meta: { align: 'right' } },
    { header: 'Fed of present', cell: ({ row }) => <span className={tone(row.original.coveragePct, 98, 90)}>{pct(row.original.coveragePct)}</span>, meta: { align: 'right' } },
    { header: 'Meals served', cell: ({ row }) => num(row.original.mealsServed), meta: { align: 'right' } },
    { header: 'On-time deliveries', cell: ({ row }) => pct(row.original.onTimeDeliveryPct), meta: { align: 'right' } },
    { header: 'Lowest cover', cell: ({ row }) => (row.original.stockDaysOfCover === null ? '—' : <span className={tone(row.original.stockDaysOfCover, 7, 3)}>{num(row.original.stockDaysOfCover)} d</span>), meta: { align: 'right' } },
    { header: 'Leftovers', cell: ({ row }) => <span className={tone(row.original.wastagePct, 8, 15, false)}>{pct(row.original.wastagePct)}</span>, meta: { align: 'right' } },
    { header: 'Traceable meals', cell: ({ row }) => pct(row.original.traceCompletenessPct), meta: { align: 'right' } },
    { header: 'Open issues', cell: ({ row }) => (row.original.openExceptions ? <Badge tone="danger">{row.original.openExceptions}</Badge> : <span className="text-muted-foreground">0</span>), meta: { align: 'right' } },
  ];

  return (
    <Page>
      <PageHeader
        title="Command centre"
        description="Whether today's meals reached children, and what in the supply chain needs attention."
        actions={<label className="flex items-center gap-2 text-sm text-muted-foreground">Day<Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} className="w-40" /></label>}
      />
      <QueryBoundary query={overview} loading={<Skeleton className="h-28 w-full" />}>{(o) => <KpiStrip kpis={o.kpis} />}</QueryBoundary>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Section title="Meals today" description={`From enrolment to the plate on ${date(day)}. Each step is reported separately.`}>
          <QueryBoundary query={overview}>{(o) => (
            <div className="grid gap-8 md:grid-cols-[1fr_1.3fr]">
              <Funnel steps={o.mealFunnel} />
              <div>
                <p className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-primary" />Meals served</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-trace" />Children present</span>
                </p>
                <ServedTrend data={o.trend} />
              </div>
            </div>
          )}</QueryBoundary>
        </Section>
        <Section title="Food through the chain" description="Kilograms in the last 30 days, by custody event." actions={<Button asChild variant="ghost" size="sm"><Link to="/trace">Trace a lot <ArrowRight /></Link></Button>}>
          <QueryBoundary query={overview}>{(o) => (
            <div className="space-y-6">
              <Funnel steps={o.supplyFunnel} color="var(--stage-warehouse)" />
              <div>
                <p className="mb-2 text-sm font-medium">Stock cover</p>
                <ul className="divide-y text-sm">
                  {o.stockRisk.length === 0 && <li className="py-2 text-muted-foreground">No stock positions yet.</li>}
                  {o.stockRisk.map((s) => (
                    <li key={s.commodityName} className="flex items-center justify-between py-1.5">
                      <span>{s.commodityName}</span>
                      <span className="flex items-baseline gap-3">
                        <span className="text-xs text-muted-foreground num">{qtyShort(s.onHand, s.unit)}</span>
                        <span className={cn('w-16 text-right font-medium num', s.daysOfCover === null ? 'text-muted-foreground' : tone(s.daysOfCover, 7, 3))}>{s.daysOfCover === null ? 'no use' : `${num(s.daysOfCover)} days`}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}</QueryBoundary>
        </Section>
      </div>

      <Section title="By area" description="Worst coverage first. Select a row to look inside that area." bodyClassName="p-0 [&>div>div]:rounded-none [&>div>div]:border-0">
        <DataTable columns={areaColumns} rows={areas.data} loading={areas.isPending} onRowClick={(a) => setGeo(a.geoPath)} getRowId={(a) => a.geoPath} empty={{ title: 'No schools in this area yet' }} />
      </Section>

      <Section title="Needs attention" actions={<Button asChild variant="ghost" size="sm"><Link to="/exceptions">All exceptions <ArrowRight /></Link></Button>} bodyClassName="p-0">
        {exceptions.isPending ? <div className="p-5"><LoadingBlock rows={3} /></div> : (
          <ul className="divide-y">
            {(exceptions.data?.data ?? []).length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No open exceptions in this area.</li>}
            {(exceptions.data?.data ?? []).map((e: ExceptionDto) => (
              <li key={e.id}>
                <button type="button" onClick={() => navigate(`/exceptions?open=${e.id}`)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-accent">
                  <StatusBadge kind="severity" value={e.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{EXCEPTION_LABEL[e.type]} · {e.facility?.name ?? '—'} · raised {ago(e.createdAt)}</p>
                  </div>
                  {e.overdue && <Badge tone="danger">Overdue</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
