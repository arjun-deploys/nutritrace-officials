import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** Lot codes are always turmeric: wherever a lot appears it can be traced in one click. */
export function LotLink({ id, code, className }: { id: string; code: string; className?: string }) {
  return (
    <Link to={`/trace/lots/${id}`} className={cn('code-id rounded px-1 py-0.5 text-trace-ink bg-trace-soft/70 hover:underline', className)} onClick={(e) => e.stopPropagation()}>
      {code}
    </Link>
  );
}

export function DocLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="code-id text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
      {children}
    </Link>
  );
}
