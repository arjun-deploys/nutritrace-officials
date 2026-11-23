import { CUSTODY_STAGES, type CustodyStage, type JourneyStageDto } from '@nt/domain';
import { cn } from '@/lib/utils';
import { qtyShort, dateShort, num } from '@/lib/format';

export const STAGE_LABEL: Record<CustodyStage, string> = {
  SOURCE: 'Source',
  WAREHOUSE: 'State warehouse',
  DISTRIBUTION: 'District store',
  KITCHEN: 'Kitchen',
  SCHOOL: 'School',
  MEAL: 'Meal served',
};
export const STAGE_COLOR: Record<CustodyStage, string> = {
  SOURCE: 'var(--stage-source)',
  WAREHOUSE: 'var(--stage-warehouse)',
  DISTRIBUTION: 'var(--stage-distribution)',
  KITCHEN: 'var(--stage-kitchen)',
  SCHOOL: 'var(--stage-school)',
  MEAL: 'var(--stage-meal)',
};

/**
 * The custody ribbon — NutriTrace's signature element. Six segments from
 * source to plate; filled segments are stages the lot has verifiably reached.
 * Compact form sits in table rows; full form heads every lot page.
 */
export function CustodyRibbon({ reached, current, flagged, className }: { reached?: CustodyStage[]; current?: CustodyStage; flagged?: boolean; className?: string }) {
  const idx = current ? CUSTODY_STAGES.indexOf(current) : -1;
  const isReached = (s: CustodyStage, i: number) => (reached ? reached.includes(s) : i <= idx);
  const label = current ? `Reached ${STAGE_LABEL[current].toLowerCase()}` : 'Custody progress';
  return (
    <div className={cn('flex w-28 items-center gap-0.5', className)} role="img" aria-label={label} title={label}>
      {CUSTODY_STAGES.map((s, i) => (
        <span
          key={s}
          className={cn('h-1.5 flex-1 first:rounded-l-full last:rounded-r-full', flagged && isReached(s, i) && 'opacity-60')}
          style={{ background: isReached(s, i) ? (flagged ? 'var(--danger)' : STAGE_COLOR[s]) : 'var(--border)' }}
        />
      ))}
    </div>
  );
}

export function CustodyRibbonFull({ stages, unit }: { stages: JourneyStageDto[]; unit?: string }) {
  return (
    <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-6">
      {stages.map((s, i) => (
        <li key={s.stage} className={cn('relative bg-card px-4 pt-5 pb-4', !s.reached && 'bg-muted/40')}>
          <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: s.reached ? STAGE_COLOR[s.stage] : 'var(--border)' }} aria-hidden />
          <p className="text-xs text-muted-foreground">
            <span className="num">{i + 1}</span> · {STAGE_LABEL[s.stage]}
          </p>
          <p className={cn('mt-1 text-lg font-semibold num', !s.reached && 'text-muted-foreground')}>
            {s.reached ? (s.stage === 'MEAL' ? `${num(s.quantity)} meals` : qtyShort(s.quantity, unit)) : 'Not yet'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {s.reached ? `${s.facilities.length} ${s.facilities.length === 1 ? 'place' : 'places'} · from ${dateShort(s.firstAt)}` : 'No custody event recorded'}
          </p>
        </li>
      ))}
    </ol>
  );
}
