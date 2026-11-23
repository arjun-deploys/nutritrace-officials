import type { KpiDto } from '@nt/domain';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { num } from '@/lib/format';

/** KPIs in one continuous strip — one surface, divided — rather than a grid of identical cards. */
export function KpiStrip({ kpis }: { kpis: KpiDto[] }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y overflow-hidden rounded-lg border bg-card sm:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] xl:divide-y-0">
      {kpis.map((k) => {
        const delta = k.previous !== undefined ? k.value - k.previous : undefined;
        const good = delta === undefined || delta === 0 ? undefined : (delta > 0) === (k.higherIsBetter !== false);
        return (
          <div key={k.key} className="min-w-0 px-4 py-4">
            <p className="text-xs leading-snug text-muted-foreground">{k.label}</p>
            <p className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tracking-tight num">{num(k.value)}</span>
              {k.unit === '%' && <span className="text-sm text-muted-foreground">%</span>}
              {delta !== undefined && delta !== 0 && (
                <span className={cn('inline-flex items-center text-xs num', good ? 'text-success' : 'text-danger')}>
                  {delta > 0 ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
                  {num(Math.abs(delta))}
                  <span className="sr-only">{good ? 'better' : 'worse'} than last week</span>
                </span>
              )}
            </p>
            {k.hint && <p className="mt-1 truncate text-xs text-muted-foreground">{k.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}
