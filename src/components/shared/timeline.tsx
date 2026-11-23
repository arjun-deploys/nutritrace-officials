import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TimelineItem {
  key: string;
  title: ReactNode;
  at?: string;
  meta?: ReactNode;
  body?: ReactNode;
  color?: string;
  muted?: boolean;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative space-y-5 border-l border-border pl-6">
      {items.map((i) => (
        <li key={i.key} className="relative">
          <span className={cn('absolute top-1.5 -left-[1.82rem] size-3 rounded-full border-2 border-card', i.muted && 'opacity-50')} style={{ background: i.color ?? 'var(--primary)' }} aria-hidden />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-medium">{i.title}</p>
            {i.at && <time className="text-xs text-muted-foreground num">{i.at}</time>}
          </div>
          {i.meta && <div className="mt-0.5 text-xs text-muted-foreground">{i.meta}</div>}
          {i.body && <div className="mt-1.5 text-sm">{i.body}</div>}
        </li>
      ))}
    </ol>
  );
}
