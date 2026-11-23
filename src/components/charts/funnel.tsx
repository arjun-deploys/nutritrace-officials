import type { FunnelStepDto } from '@nt/domain';
import { num, pct } from '@/lib/format';

/**
 * Each step is drawn relative to the first; the gap to the previous step is
 * printed so a drop (e.g. children present but not served) is impossible to miss.
 */
export function Funnel({ steps, color = 'var(--primary)' }: { steps: FunnelStepDto[]; color?: string }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        const drop = prev && prev.value > 0 ? ((prev.value - s.value) / prev.value) * 100 : 0;
        return (
          <li key={s.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span>{s.label}</span>
              <span className="flex items-baseline gap-2">
                {prev && drop > 0.05 && <span className={drop > 5 ? 'text-xs text-danger' : 'text-xs text-muted-foreground'}>−{pct(drop)}</span>}
                <span className="font-semibold num">{num(s.value)}</span>
                <span className="text-xs text-muted-foreground">{s.unit}</span>
              </span>
            </div>
            <div className="h-2.5 rounded-sm bg-muted">
              <div className="h-full rounded-sm" style={{ width: `${(s.value / max) * 100}%`, background: color, opacity: 1 - i * 0.12 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
