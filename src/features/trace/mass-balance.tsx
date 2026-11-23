import type { LotFlowDto } from '@nt/domain';
import { qty, pct, num } from '@/lib/format';

/** Where every unit of the lot is now. Unaccounted quantity is the number auditors look for first. */
export function MassBalance({ flow, unit }: { flow: LotFlowDto; unit: string }) {
  const start = flow.dispatchedBySupplier || flow.procured || 1;
  const parts = [
    { key: 'consumed', label: 'Cooked into meals', value: flow.consumed, color: 'var(--stage-meal)' },
    { key: 'onHand', label: 'In stock now', value: flow.onHand, color: 'var(--stage-warehouse)' },
    { key: 'inTransit', label: 'In transit', value: flow.inTransit, color: 'var(--info)' },
    { key: 'rejected', label: 'Rejected at receipt', value: flow.rejected, color: 'var(--warning)' },
    { key: 'wasted', label: 'Spoiled / written off', value: flow.wasted + Math.max(0, -flow.adjusted), color: 'var(--muted-foreground)' },
    { key: 'unaccounted', label: 'Unaccounted (short at receipt)', value: flow.unaccounted, color: 'var(--danger)' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label="Distribution of the lot quantity">
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.key} style={{ width: `${(p.value / start) * 100}%`, background: p.color }} title={`${p.label}: ${qty(p.value, unit)}`} />)}
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {parts.map((p) => (
          <div key={p.key} className="flex items-baseline justify-between gap-2 border-b border-dashed py-1">
            <dt className="flex items-center gap-2 text-sm"><span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />{p.label}</dt>
            <dd className={p.key === 'unaccounted' && p.value > 0 ? 'font-semibold text-danger num' : 'font-medium num'}>{qty(p.value, unit)} <span className="text-xs font-normal text-muted-foreground">{pct((p.value / start) * 100)}</span></dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground num">
        Started with {qty(start, unit)} dispatched by the supplier ({qty(flow.accepted, unit)} accepted at the first warehouse). Reached {num(flow.facilitiesReached)} facilities and fed {num(flow.mealsServed)} meals in {num(flow.schoolsReached)} schools.
      </p>
    </div>
  );
}
