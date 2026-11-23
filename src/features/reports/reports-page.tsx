import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { useScopePath } from '@/app/layouts/scope-switcher';
import { insight } from '@/lib/api';
import { isApiError } from '@/lib/http';
import { today } from '@/lib/format';
import { toast } from 'sonner';

const REPORTS = [
  { key: 'meal-service', title: 'Meal service register', body: 'One row per school, day and meal: enrolled, present, prepared, served, leftovers, interruptions and whether the meal is linked to a traceable batch.' },
  { key: 'shipments', title: 'Shipment register', body: 'Every shipment touching the area with expected and actual arrival, delay and discrepancy flags.' },
  { key: 'exceptions', title: 'Exception register', body: 'All exceptions raised, their owner role, due time and resolution — for review meetings and audits.' },
  { key: 'stock', title: 'Stock position', body: 'Current balance of every lot at every facility in the area.' },
];

export default function ReportsPage() {
  const geoPath = useScopePath();
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState<string>();
  const run = async (key: string) => {
    setBusy(key);
    try { await insight.exportReport(key, { from, to, geoPath }); toast.success('Report downloaded'); }
    catch (e) { toast.error(isApiError(e) ? e.message : 'Export failed'); }
    finally { setBusy(undefined); }
  };
  return (
    <Page className="max-w-5xl">
      <PageHeader title="Reports" description="Downloads include the area, period and generation time in the file name. Exports are logged." />
      <Section>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5"><Label htmlFor="rf">From</Label><Input id="rf" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-44" /></div>
          <div className="space-y-1.5"><Label htmlFor="rt">To</Label><Input id="rt" type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} className="w-44" /></div>
          <p className="pb-2 text-sm text-muted-foreground">Area: <span className="font-medium text-foreground">{geoPath}</span></p>
        </div>
      </Section>
      <ul className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <li key={r.key} className="flex flex-col justify-between gap-4 rounded-lg border bg-card p-5">
            <div className="flex gap-3"><FileSpreadsheet className="size-5 shrink-0 text-primary" /><div><p className="font-medium">{r.title}</p><p className="mt-1 text-sm text-muted-foreground">{r.body}</p></div></div>
            <Button variant="outline" className="self-start" loading={busy === r.key} onClick={() => void run(r.key)}><Download /> Download CSV</Button>
          </li>
        ))}
      </ul>
    </Page>
  );
}
