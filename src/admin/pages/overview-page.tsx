import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@nt/domain';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { KpiStrip } from '@/components/shared/kpi-strip';
import { LoadingBlock } from '@/components/shared/states';
import { adminApi, insight, registry } from '@/lib/api';
import { ago, num } from '@/lib/format';
import { useCan } from '@/stores/auth';

/** What an administrator needs to fix before the field can work smoothly. */
export default function AdminOverviewPage() {
  const health = useQuery(adminApi.health());
  const stats = useQuery(adminApi.userStats());
  const tenant = useQuery(registry.tenant());
  const canAudit = useCan('audit:read');
  const audit = useQuery({ ...insight.audit({ pageSize: 8 }), enabled: canAudit });
  if (health.isPending || stats.isPending) return <Page><LoadingBlock rows={6} /></Page>;
  const h = health.data;
  const u = stats.data;
  const schools = h?.facilities.SCHOOL ?? 0;
  const checks = [
    { ok: (u?.schoolsWithHead ?? 0) >= schools, text: `${num(Math.max(0, schools - (u?.schoolsWithHead ?? 0)))} schools have no headmaster account`, okText: 'Every school has a headmaster account', to: '/admin/users', fix: 'Onboard users' },
    { ok: !h?.facilitiesWithoutCoordinates, text: `${num(h?.facilitiesWithoutCoordinates ?? 0)} facilities have no map coordinates (needed for last-mile tracking)`, okText: 'Every facility has map coordinates', to: '/admin/facilities', fix: 'Update facilities' },
    { ok: !h?.schoolsWithoutKitchenLink, text: `${num(h?.schoolsWithoutKitchenLink ?? 0)} schools without a kitchen are not linked to a central kitchen`, okText: 'Every school has a kitchen or a linked central kitchen', to: '/admin/facilities', fix: 'Link kitchens' },
    { ok: !h?.suppliers.PENDING_VERIFICATION, text: `${num(h?.suppliers.PENDING_VERIFICATION ?? 0)} suppliers are waiting for verification`, okText: 'No suppliers waiting for verification', to: '/admin/suppliers', fix: 'Review suppliers' },
    { ok: !h?.suppliersLicenceExpiring, text: `${num(h?.suppliersLicenceExpiring ?? 0)} approved suppliers have an FSSAI licence expiring within 60 days`, okText: 'No supplier licences expiring in the next 60 days', to: '/admin/suppliers', fix: 'Review suppliers' },
    { ok: !u?.neverSignedIn, text: `${num(u?.neverSignedIn ?? 0)} users have never signed in`, okText: 'Every user has signed in at least once', to: '/admin/users', fix: 'Follow up' },
  ];
  return (
    <Page>
      <PageHeader title="Admin Console" description={`Configuration of ${tenant.data?.name ?? 'the programme'}: people, structure, catalogue and data. Everything here is audited.`} />
      <KpiStrip kpis={[
        { key: 'users', label: 'Users', value: u?.total ?? 0, hint: `${num(u?.suspended ?? 0)} suspended` },
        { key: 'schools', label: 'Schools', value: schools },
        { key: 'wh', label: 'Warehouses & kitchens', value: (h?.facilities.STATE_WAREHOUSE ?? 0) + (h?.facilities.DISTRICT_WAREHOUSE ?? 0) + (h?.facilities.BLOCK_STORE ?? 0) + (h?.facilities.CENTRAL_KITCHEN ?? 0) },
        { key: 'loc', label: 'Locations', value: Object.values(h?.locations ?? {}).reduce((a, b) => a + b, 0), hint: Object.entries(h?.locations ?? {}).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(' · ') },
        { key: 'sup', label: 'Approved suppliers', value: h?.suppliers.APPROVED ?? 0 },
        { key: 'prod', label: 'Products', value: h?.products ?? 0 },
      ]} />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Section title="Data health" description="Gaps that will slow the field down. Each links to where it is fixed." bodyClassName="p-0">
          <ul className="divide-y">
            {checks.map((c) => (
              <li key={c.text} className="flex items-center gap-3 px-5 py-3 text-sm">
                {c.ok ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <AlertTriangle className="size-5 shrink-0 text-warning" />}
                <span className={c.ok ? 'text-muted-foreground' : ''}>{c.ok ? c.okText : c.text}</span>
                {!c.ok && <Link to={c.to} className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-primary hover:underline">{c.fix}<ArrowRight className="size-3.5" /></Link>}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="People by role" bodyClassName="p-0">
          <ul className="divide-y text-sm">
            {Object.entries(u?.byRole ?? {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
              <li key={r} className="flex justify-between px-5 py-2"><span>{ROLE_LABELS[r as Role] ?? r}</span><span className="num">{n}</span></li>
            ))}
          </ul>
        </Section>
      </div>
      {canAudit && (
        <Section title="Recent changes" actions={<Link to="/admin/audit" className="text-sm text-primary hover:underline">Audit trail</Link>} bodyClassName="p-0">
          <ul className="divide-y text-sm">
            {(audit.data?.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5">
                <span className="font-mono text-xs">{a.action}</span><span>{a.entity.label}</span><span className="ml-auto text-xs text-muted-foreground">{a.actor.name} · {ago(a.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}
