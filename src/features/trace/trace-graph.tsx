import { useState } from 'react';
import { CUSTODY_STAGES, type TraceGraphDto, type TraceNodeDto } from '@nt/domain';
import { STAGE_COLOR, STAGE_LABEL } from '@/components/shared/custody-ribbon';
import { Button } from '@/components/ui/button';
import { num, qtyShort, dateShort } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Lanes by custody stage. A lot that fed 70 schools shows 70 school rows in
 * the last lane, grouped and collapsible — readable where a node-link diagram is not.
 */
export function TraceLanes({ graph, emptyText = 'No downstream movement yet.' }: { graph: TraceGraphDto; emptyText?: string }) {
  const inbound = new Map<string, { quantity?: number; unit?: string; label: string }>();
  for (const e of graph.edges) inbound.set(graph.direction === 'forward' ? e.to : e.from, { quantity: e.quantity, unit: e.unit, label: e.label });
  const lanes = CUSTODY_STAGES.map((stage) => ({ stage, nodes: graph.nodes.filter((n) => n.stage === stage) })).filter((l) => l.nodes.length);
  if (graph.nodes.length <= 1) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground num">
        {graph.summary.suppliers} supplier · {graph.summary.lots} {graph.summary.lots === 1 ? 'lot' : 'lots'} · {graph.summary.facilities} facilities · {graph.summary.schools} schools · {num(graph.summary.meals)} meals
      </p>
      <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(13rem, 1fr))` }}>
        {lanes.map((l) => <Lane key={l.stage} stage={l.stage} nodes={l.nodes} inbound={inbound} />)}
      </div>
    </div>
  );
}

function Lane({ stage, nodes, inbound }: { stage: (typeof CUSTODY_STAGES)[number]; nodes: TraceNodeDto[]; inbound: Map<string, { quantity?: number; unit?: string }> }) {
  const [all, setAll] = useState(false);
  const shown = all ? nodes : nodes.slice(0, 8);
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 p-2">
      <p className="flex items-center gap-2 px-1 pb-2 text-xs font-medium">
        <span className="size-2 rounded-full" style={{ background: STAGE_COLOR[stage] }} aria-hidden />
        {STAGE_LABEL[stage]} <span className="text-muted-foreground num">({nodes.length})</span>
      </p>
      <ul className="space-y-1.5">
        {shown.map((n) => {
          const inb = inbound.get(n.id);
          return (
            <li key={n.id} className={cn('rounded-md border bg-card px-2.5 py-2 text-sm', n.flagged && 'border-danger/50 bg-danger-soft/40')} style={{ borderLeft: `3px solid ${STAGE_COLOR[stage]}` }}>
              <p className={cn('truncate font-medium', n.kind === 'LOT' && 'code-id text-trace-ink')}>{n.label}</p>
              <p className="truncate text-xs text-muted-foreground num">
                {n.kind === 'SCHOOL_MEALS' ? `${num(n.meals ?? 0)} meals${n.at ? ` · last ${dateShort(n.at)}` : ''}` : inb?.quantity !== undefined ? qtyShort(inb.quantity, inb.unit) : n.sublabel ?? ''}
              </p>
            </li>
          );
        })}
      </ul>
      {nodes.length > 8 && <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show all ${nodes.length}`}</Button>}
    </div>
  );
}
