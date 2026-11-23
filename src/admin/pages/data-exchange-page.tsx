import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { EXCHANGE, EXCHANGE_ENTITIES } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { exchange } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useCan } from '@/stores/auth';
import { downloadTemplate, ExchangeActions } from '../components/exchange';

const INVALIDATE: Record<string, string[]> = { locations: ['geo-units'], facilities: ['facilities'], suppliers: ['suppliers'], commodities: ['commodities'], vehicles: ['vehicles'], users: ['users', 'user-stats'] };

/** One place for every bulk import and export, with templates and history. */
export default function DataExchangePage() {
  const canAudit = useCan('audit:read');
  const history = useQuery({ ...exchange.history(), enabled: canAudit });
  return (
    <Page>
      <PageHeader title="Data exchange" description="Load master data from government sources (UDISE+, district lists, supplier registers) and take it out again. Every import is checked in full before anything is saved, and every import and export is recorded." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {EXCHANGE_ENTITIES.map((e) => {
          const d = EXCHANGE[e];
          return (
            <section key={e} className="flex flex-col justify-between gap-4 rounded-lg border bg-card p-5">
              <div>
                <h2 className="font-semibold">{d.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">Matched on <span className="font-mono">{d.keyColumn}</span> · {d.columns.length} columns</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => downloadTemplate(e)}><Download /> Template</Button>
                <ExchangeActions entity={e} invalidate={INVALIDATE[e] ?? []} />
              </div>
            </section>
          );
        })}
      </div>
      {canAudit && (
        <Section title="History" description="The last 50 imports and exports in your area." bodyClassName="p-0">
          <ul className="divide-y text-sm">
            {(history.data?.data ?? []).length === 0 && <li className="px-5 py-6 text-center text-muted-foreground">No imports or exports yet.</li>}
            {(history.data?.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5">
                <span className={a.action.endsWith('imported') ? 'font-medium text-primary' : 'font-medium'}>{a.action.endsWith('imported') ? 'Import' : 'Export'}</span>
                <span>{a.entity.label}</span>
                {a.changes?.length ? <span className="text-xs text-muted-foreground">{a.changes.map((c) => `${String(c.to)} ${c.field}`).join(', ')}</span> : null}
                <span className="ml-auto text-xs text-muted-foreground">{a.actor.name} · {dateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}
