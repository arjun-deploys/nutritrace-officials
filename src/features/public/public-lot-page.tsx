import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { CUSTODY_STAGES, type CustodyStage } from '@nt/domain';
import { CustodyRibbon, STAGE_LABEL } from '@/components/shared/custody-ribbon';
import { DetailList } from '@/components/shared/page';
import { LoadingBlock } from '@/components/shared/states';
import { BrandMark } from '@/app/layouts/app-sidebar';
import { trace } from '@/lib/api';
import { date } from '@/lib/format';

/** What anyone sees when they scan a lot label: provenance and safety status only — no quantities, no people. */
export default function PublicLotPage() {
  const { code = '' } = useParams();
  const q = useQuery({ ...trace.publicLot(code), retry: false });
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex items-center gap-2"><BrandMark className="size-7" /><span className="font-semibold">NutriTrace</span><span className="text-sm text-muted-foreground">· food provenance</span></div>
      {q.isPending ? <LoadingBlock rows={4} /> : !q.data ? (
        <div className="rounded-lg border bg-card p-5"><p className="font-medium">We could not find lot {code}</p><p className="mt-1 text-sm text-muted-foreground">Check the code printed under the QR label.</p></div>
      ) : (
        <div className="space-y-4 rounded-lg border bg-card p-5">
          <p className="code-id text-xl text-trace-ink">{q.data.code}</p>
          <p className="text-lg font-medium">{q.data.commodity}</p>
          {q.data.safeToUse
            ? <p className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success"><CheckCircle2 className="size-4" /> Passed quality checks and cleared for use.</p>
            : <p className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"><ShieldAlert className="size-4" /> Not cleared for use ({q.data.status.toLowerCase().replace('_', ' ')}). Do not cook with this lot.</p>}
          <DetailList columns={1} items={[
            { label: 'Supplied by', value: q.data.supplier },
            { label: 'Origin', value: `${q.data.origin.district}, ${q.data.origin.state}` },
            { label: 'Packed on', value: date(q.data.packedOn) },
            { label: 'Use before', value: date(q.data.expiresOn) },
          ]} />
          <div className="space-y-1.5 border-t pt-4">
            <p className="text-xs text-muted-foreground">Furthest point reached</p>
            <CustodyRibbon current={q.data.stageReached as CustodyStage} className="w-full" />
            <p className="text-sm">{STAGE_LABEL[q.data.stageReached as CustodyStage] ?? CUSTODY_STAGES[0]}</p>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">This page shows where a lot of school-meal food came from. It contains no personal data. Powered by StaTwig.</p>
    </main>
  );
}
