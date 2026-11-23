import { cn } from '@/lib/utils';

export function Progress({ value, className, tone = 'primary', label }: { value: number; className?: string; tone?: 'primary' | 'trace' | 'danger' | 'warning'; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const bar = { primary: 'bg-primary', trace: 'bg-trace', danger: 'bg-danger', warning: 'bg-warning' }[tone];
  return (
    <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-[width]', bar)} style={{ width: `${v}%` }} />
    </div>
  );
}
