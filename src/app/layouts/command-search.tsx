import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Package, Search, School, Truck } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useDebounced } from '@/hooks/use-debounced';
import { logistics, registry, trace } from '@/lib/api';
import { NAV } from '@/config/nav';
import { can } from '@nt/domain';
import { useAuthStore } from '@/stores/auth';

/** Ctrl/⌘+K: jump to any lot, shipment or school — the fastest route into a trace. */
export function CommandSearch() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const navigate = useNavigate();
  const perms = useAuthStore((s) => s.user?.permissions);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const enabled = open && dq.length >= 2;
  const lots = useQuery({ ...trace.lots({ q: dq, pageSize: 5 }), enabled: enabled && can(perms, 'trace:read') });
  const ships = useQuery({ ...logistics.shipments({ q: dq, pageSize: 5 }), enabled: enabled && can(perms, 'shipment:read') });
  const schools = useQuery({ ...registry.facilities({ q: dq, pageSize: 5, type: 'SCHOOL' }), enabled: enabled && can(perms, 'master:read') });
  const go = (to: string) => { setOpen(false); setQ(''); navigate(to); };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground hover:bg-accent">
        <Search className="size-4" aria-hidden />
        <span className="truncate">{t('shell.search')}</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput value={q} onValueChange={setQ} placeholder="Lot code, supplier lot, shipment no., school name or UDISE code" />
        <CommandList>
          <CommandEmpty>{dq.length < 2 ? 'Type at least two characters.' : 'No matches in your area.'}</CommandEmpty>
          {!!lots.data?.data.length && (
            <CommandGroup heading="Lots">
              {lots.data.data.map((l) => (
                <CommandItem key={l.id} value={`lot-${l.id}`} onSelect={() => go(`/trace/lots/${l.id}`)}>
                  <Package className="text-trace" /><span className="code-id">{l.code}</span><span className="truncate text-muted-foreground">{l.commodity.name} · {l.supplier.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!ships.data?.data.length && (
            <CommandGroup heading="Shipments">
              {ships.data.data.map((s) => (
                <CommandItem key={s.id} value={`shp-${s.id}`} onSelect={() => go(`/logistics/shipments/${s.id}`)}>
                  <Truck /><span className="code-id">{s.shipmentNo}</span><span className="truncate text-muted-foreground">to {s.to.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!schools.data?.data.length && (
            <CommandGroup heading="Schools">
              {schools.data.data.map((f) => (
                <CommandItem key={f.id} value={`sch-${f.id}`} onSelect={() => go(`/schools/${f.id}`)}>
                  <School /><span className="truncate">{f.name}</span><span className="text-muted-foreground">{f.school?.udiseCode}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {dq.length < 2 && (
            <CommandGroup heading="Go to">
              {NAV.flatMap((g) => g.items).filter((i) => can(perms, i.permission)).map((i) => (
                <CommandItem key={i.key} value={i.key} onSelect={() => go(i.to)}><i.icon />{t(i.label)}</CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
