import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { can, ROLE_LABELS, type Permission } from '@nt/domain';
import { Badge } from '@/components/ui/badge';
import { Page, PageHeader } from '@/components/shared/page';
import { LoadingBlock } from '@/components/shared/states';
import { indents, insight, inventory, logistics, meals, procurement, quality, trips } from '@/lib/api';
import { date, dateTime, qty } from '@/lib/format';
import { MEAL_LABEL } from '@/config/status';
import { useUser } from '@/stores/auth';

interface Task { key: string; title: string; to: string; items: { key: string; label: ReactNode; sub?: ReactNode; to: string }[]; total: number; loading: boolean; urgent?: boolean }

/** Everything waiting for *this* person, in the order they should do it. */
export default function MyWorkPage() {
  const user = useUser();
  const has = (p: Permission) => can(user.permissions, p);
  const fid = user.facilityId;
  const t = new Date().toLocaleDateString('en-CA');
  const q = {
    receive: useQuery({ ...logistics.shipments({ direction: 'inbound', open: true, pageSize: 5 }), enabled: has('shipment:receive') && !!fid }),
    meals: useQuery({ ...meals.status({ date: t }), enabled: has('meal:serve:report') && !!fid }),
    run: useQuery({ ...trips.list({ pageSize: 10, sort: 'plannedStartAt', order: 'asc' }), enabled: has('trip:run') }),
    indentApprove: useQuery({ ...indents.list({ status: 'SUBMITTED', direction: fid ? 'inbound' : undefined, pageSize: 5 }), enabled: has('indent:approve') }),
    indentShip: useQuery({ ...indents.list({ open: true, direction: fid ? 'inbound' : undefined, pageSize: 20 }), enabled: has('shipment:create') }),
    pos: useQuery({ ...procurement.orders({ status: 'PENDING_APPROVAL', pageSize: 5 }), enabled: has('po:approve') }),
    adj: useQuery({ ...inventory.adjustments({ status: 'PENDING', pageSize: 5 }), enabled: has('stock:adjust:approve') }),
    qc: useQuery({ ...quality.inspections({ undecided: true, pageSize: 5 }), enabled: has('quality:decide') }),
    recalls: useQuery({ ...quality.recalls({ pageSize: 10 }), enabled: has('recall:acknowledge') && !!fid }),
    exc: useQuery({ ...insight.exceptions({ open: true, pageSize: 50 }), enabled: has('exception:manage') }),
  };
  const ok = (x: { isPending: boolean; fetchStatus: string }) => x.isPending && x.fetchStatus !== 'idle';
  const tasks: Task[] = [];
  if (has('shipment:receive') && fid) tasks.push({ key: 'receive', title: 'Deliveries to receive', to: '/logistics/shipments?direction=inbound', total: q.receive.data?.meta.total ?? 0, loading: ok(q.receive), urgent: true,
    items: (q.receive.data?.data ?? []).map((s) => ({ key: s.id, label: <><span className="code-id">{s.shipmentNo}</span> from {s.from.name}</>, sub: `${s.lines.length} lots · expected ${dateTime(s.expectedArrivalAt)}`, to: `/logistics/shipments/${s.id}/receive` })) });
  const myMeals = (q.meals.data ?? []).filter((r) => r.school.id === fid).flatMap((r) => r.meals.filter((m) => m.status === 'PENDING').map((m) => ({ key: m.mealType, label: `Report ${MEAL_LABEL[m.mealType]?.toLowerCase()} for today`, sub: r.school.name, to: `/schools/${r.school.id}` })));
  if (has('meal:serve:report') && fid) tasks.push({ key: 'meals', title: 'Meals to report today', to: `/schools/${fid}`, total: myMeals.length, loading: ok(q.meals), urgent: true, items: myMeals });
  const runnable = (q.run.data?.data ?? []).filter((x) => x.status === 'PLANNED' || x.status === 'IN_PROGRESS');
  if (has('trip:run')) tasks.push({ key: 'run', title: 'Trips to run', to: '/last-mile', total: runnable.length, loading: ok(q.run), items: runnable.slice(0, 5).map((x) => ({ key: x.id, label: <><span className="code-id">{x.tripNo}</span> · {x.stops.length} schools</>, sub: `${x.status === 'IN_PROGRESS' ? 'On the road' : 'Leaves'} ${dateTime(x.startedAt ?? x.plannedStartAt)} · ${x.progress.delivered}/${x.progress.total} delivered`, to: `/last-mile/trips/${x.id}` })) });
  if (has('indent:approve')) tasks.push({ key: 'ia', title: 'Indents to approve', to: '/indents?status=SUBMITTED', total: q.indentApprove.data?.meta.total ?? 0, loading: ok(q.indentApprove),
    items: (q.indentApprove.data?.data ?? []).map((i) => ({ key: i.id, label: <><span className="code-id">{i.indentNo}</span> from {i.requesting.name}</>, sub: `${i.lines.map((l) => `${l.commodityName.split(' ')[0]} ${qty(l.requested, l.unit)}`).join(', ')} · needed by ${date(i.neededBy)}`, to: `/indents/${i.id}` })) });
  const toShip = (q.indentShip.data?.data ?? []).filter((i) => i.status === 'APPROVED' || i.status === 'PARTIALLY_FULFILLED');
  if (has('shipment:create')) tasks.push({ key: 'is', title: 'Approved indents to ship', to: '/indents', total: toShip.length, loading: ok(q.indentShip), items: toShip.slice(0, 5).map((i) => ({ key: i.id, label: <><span className="code-id">{i.indentNo}</span> to {i.requesting.name}</>, sub: `needed by ${date(i.neededBy)}`, to: `/logistics/shipments/new?indent=${i.id}` })) });
  if (has('po:approve')) tasks.push({ key: 'po', title: 'Purchase orders to approve', to: '/procurement/orders?status=PENDING_APPROVAL', total: q.pos.data?.meta.total ?? 0, loading: ok(q.pos), items: (q.pos.data?.data ?? []).filter((p) => p.createdBy.userId !== user.id).map((p) => ({ key: p.id, label: <><span className="code-id">{p.poNumber}</span> · {p.supplier.name}</>, sub: `raised by ${p.createdBy.name}`, to: `/procurement/orders/${p.id}` })) });
  if (has('stock:adjust:approve')) tasks.push({ key: 'adj', title: 'Stock write-offs to approve', to: '/inventory?tab=adjustments', total: q.adj.data?.meta.total ?? 0, loading: ok(q.adj), items: (q.adj.data?.data ?? []).filter((a) => a.requestedBy.userId !== user.id).map((a) => ({ key: a.id, label: <><span className="code-id">{a.adjNo}</span> · {qty(a.quantityDelta, a.lot.unit)} {a.lot.code}</>, sub: `${a.facility.name} · ${a.reason.toLowerCase()}`, to: '/inventory?tab=adjustments' })) });
  if (has('quality:decide')) tasks.push({ key: 'qc', title: 'Lots waiting for a quality decision', to: '/quality/inspections?undecided=true', total: (q.qc.data?.data ?? []).filter((i) => i.lot).length, loading: ok(q.qc), urgent: true, items: (q.qc.data?.data ?? []).filter((i) => i.lot).map((i) => ({ key: i.id, label: <><span className="code-id">{i.lot!.code}</span> · {i.result.toLowerCase()}</>, sub: `${i.inspectionNo} at ${i.facility.name}`, to: '/quality/inspections?undecided=true' })) });
  const recallsToAck = (q.recalls.data?.data ?? []).filter((r) => r.status !== 'CLOSED' && r.affected.some((a) => a.facility.id === fid && !a.acknowledged));
  if (has('recall:acknowledge') && fid) tasks.push({ key: 'rc', title: 'Recalls to acknowledge', to: '/quality/recalls', total: recallsToAck.length, loading: ok(q.recalls), urgent: true, items: recallsToAck.map((r) => ({ key: r.id, label: <><span className="code-id">{r.recallNo}</span> · {r.lots.map((l) => l.code).join(', ')}</>, sub: r.instruction, to: `/quality/recalls/${r.id}` })) });
  const mine = (q.exc.data?.data ?? []).filter((e) => e.owner?.role === user.role);
  if (has('exception:manage')) tasks.push({ key: 'ex', title: `Exceptions owned by ${ROLE_LABELS[user.role].toLowerCase()}s`, to: '/exceptions', total: mine.length, loading: ok(q.exc), items: mine.slice(0, 5).map((e) => ({ key: e.id, label: e.title, sub: `${e.exceptionNo}${e.overdue ? ' · overdue' : ''}`, to: `/exceptions?open=${e.id}` })) });

  const loading = tasks.some((x) => x.loading);
  const open = tasks.filter((x) => x.total > 0).sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
  const done = tasks.filter((x) => !x.loading && x.total === 0);
  return (
    <Page className="max-w-4xl">
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' ').slice(-1)[0]}`} description={`${ROLE_LABELS[user.role]} · ${user.scopeLabel}. Here is what is waiting for you.`} />
      {loading && !open.length ? <LoadingBlock rows={4} /> : open.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-card px-6 py-12 text-center"><CheckCircle2 className="size-8 text-success" /><p className="font-medium">You are all caught up</p><p className="text-sm text-muted-foreground">Nothing is waiting for you right now.</p></div>
      ) : (
        <div className="space-y-4">
          {open.map((task) => (
            <section key={task.key} className="rounded-lg border bg-card">
              <header className="flex items-center gap-3 border-b px-5 py-3">
                <h2 className="font-semibold">{task.title}</h2><Badge tone={task.urgent ? 'warning' : 'info'}>{task.total}</Badge>
                <Link to={task.to} className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline">Open all <ArrowRight className="size-3.5" /></Link>
              </header>
              <ul className="divide-y">
                {task.items.slice(0, 5).map((i) => (
                  <li key={i.key}><Link to={i.to} className="flex items-center gap-3 px-5 py-3 hover:bg-accent"><div className="min-w-0 flex-1"><p className="truncate text-sm">{i.label}</p>{i.sub && <p className="truncate text-xs text-muted-foreground">{i.sub}</p>}</div><ArrowRight className="size-4 text-muted-foreground" /></Link></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {done.length > 0 && <p className="text-sm text-muted-foreground">Nothing waiting in: {done.map((d) => d.title.toLowerCase()).join(' · ')}.</p>}
    </Page>
  );
}
