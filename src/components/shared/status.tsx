import { Badge } from '@/components/ui/badge';
import { statusOf, type StatusKind } from '@/config/status';

export function StatusBadge({ kind, value, className }: { kind: StatusKind; value?: string | null; className?: string }) {
  const s = statusOf(kind, value);
  return (
    <Badge tone={s.tone} className={className}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {s.label}
    </Badge>
  );
}
