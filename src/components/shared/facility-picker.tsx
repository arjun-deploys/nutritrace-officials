import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { FacilityType } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDebounced } from '@/hooks/use-debounced';
import { registry } from '@/lib/api';
import { humanize } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Searchable facility combobox (server-side search; scales to tens of thousands of schools). */
export function FacilityPicker({ value, onChange, types, placeholder = 'Search by name or code', id, invalid, exclude }: { value?: string; onChange: (id: string, name: string) => void; types?: FacilityType[]; placeholder?: string; id?: string; invalid?: boolean; exclude?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const { data, isFetching } = useQuery({ ...registry.facilities({ q: dq, pageSize: 30, type: types?.length === 1 ? types[0] : undefined }), enabled: open });
  const [label, setLabel] = useState<string>();
  const options = (data?.data ?? []).filter((f) => (!types || types.includes(f.type)) && f.id !== exclude);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid || undefined} className="w-full justify-between font-normal">
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{value ? label ?? 'Selected facility' : placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{isFetching ? 'Searching…' : 'No matching facility in your area'}</CommandEmpty>
            <CommandGroup>
              {options.map((f) => (
                <CommandItem key={f.id} value={f.id} onSelect={() => { onChange(f.id, f.name); setLabel(f.name); setOpen(false); }}>
                  <Check className={cn('size-4', value === f.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0">
                    <p className="truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{humanize(f.type)} · {f.code} · {f.districtName}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
