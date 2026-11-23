import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, MapPin, Pencil, Plus } from 'lucide-react';
import { geoUnitCreateSchema, type GeoUnitCreateInput, type GeoUnitDto } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { Field, FormError } from '@/components/shared/form';
import { QueryBoundary } from '@/components/shared/states';
import { registry } from '@/lib/api';
import { useCan } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ExchangeActions } from '@/admin/components/exchange';

/** The state's administrative hierarchy: State › District › Block (names configurable per state). */
export default function LocationsPage() {
  const units = useQuery(registry.geoUnits());
  const tenant = useQuery(registry.tenant());
  const [adding, setAdding] = useState<GeoUnitDto>();
  const [renaming, setRenaming] = useState<GeoUnitDto>();
  const levels = tenant.data?.config.hierarchyLevels ?? [];
  return (
    <Page className="max-w-4xl">
      <PageHeader title="Levels & locations" description={`Levels in this state: ${levels.join(' › ')}. Every warehouse, school and user belongs to one area, and access follows this tree.`} actions={<ExchangeActions entity="locations" invalidate={['geo-units']} />} />
      <Section bodyClassName="p-2">
        <QueryBoundary query={units}>{(all) => {
          const root = all.reduce<GeoUnitDto | undefined>((a, u) => (!a || u.level < a.level ? u : a), undefined);
          return root ? <Node unit={root} all={all} levels={levels} onAdd={setAdding} onRename={setRenaming} defaultOpen /> : null;
        }}</QueryBoundary>
      </Section>
      <AddDialog parent={adding} childLevel={adding ? levels[adding.level + 1] : undefined} onClose={() => setAdding(undefined)} />
      <RenameDialog unit={renaming} onClose={() => setRenaming(undefined)} />
    </Page>
  );
}

function Node({ unit, all, levels, onAdd, onRename, defaultOpen }: { unit: GeoUnitDto; all: GeoUnitDto[]; levels: string[]; onAdd: (u: GeoUnitDto) => void; onRename: (u: GeoUnitDto) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const canManage = useCan('master:manage');
  const children = all.filter((u) => u.parentId === unit.id).sort((a, b) => a.name.localeCompare(b.name));
  const canHaveChildren = unit.level + 1 < levels.length;
  return (
    <div>
      <div className={cn('group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent')} style={{ paddingLeft: `${unit.level * 1.5 + 0.5}rem` }}>
        <button type="button" onClick={() => setOpen((o) => !o)} className={cn('rounded p-0.5', !children.length && 'invisible')} aria-label={open ? `Collapse ${unit.name}` : `Expand ${unit.name}`} aria-expanded={open}>
          <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
        </button>
        <MapPin className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">{unit.name}</span>
        <span className="text-xs text-muted-foreground">{unit.levelName} · {unit.code}{children.length ? ` · ${children.length} ${levels[unit.level + 1]?.toLowerCase()}${children.length === 1 ? '' : 's'}` : ''}</span>
        {canManage && (
          <span className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            {unit.level > 0 && <Button size="sm" variant="ghost" onClick={() => onRename(unit)}><Pencil /> Rename</Button>}
            {canHaveChildren && <Button size="sm" variant="ghost" onClick={() => { setOpen(true); onAdd(unit); }}><Plus /> Add {levels[unit.level + 1]?.toLowerCase()}</Button>}
          </span>
        )}
      </div>
      {open && children.map((c) => <Node key={c.id} unit={c} all={all} levels={levels} onAdd={onAdd} onRename={onRename} />)}
    </div>
  );
}

function AddDialog({ parent, childLevel, onClose }: { parent?: GeoUnitDto; childLevel?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string>();
  const form = useForm<GeoUnitCreateInput>({ resolver: zodResolver(geoUnitCreateSchema), values: { code: '', name: '', parentId: parent?.id ?? '' } });
  const m = useMutation({
    mutationFn: registry.createGeoUnit, meta: { silent: true },
    onSuccess: (u) => { toast.success(`${u.name} added`); void qc.invalidateQueries({ queryKey: ['geo-units'] }); form.reset(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Dialog open={!!parent} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add {childLevel?.toLowerCase()} under {parent?.name}</DialogTitle><DialogDescription>The code becomes part of every record's location path and cannot be changed later.</DialogDescription></DialogHeader>
        <form id="geo-add" className="space-y-3" onSubmit={form.handleSubmit((v) => { setError(undefined); m.mutate(v); })} noValidate>
          <FormError message={error} />
          <Field label="Name" error={form.formState.errors.name} required><Input {...form.register('name')} placeholder="e.g. Melur" /></Field>
          <Field label="Code" error={form.formState.errors.code} required hint="Short and unique, e.g. MLR"><Input {...form.register('code')} className="uppercase" /></Field>
        </form>
        <DialogFooter><Button type="submit" form="geo-add" loading={m.isPending}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ unit, onClose }: { unit?: GeoUnitDto; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const m = useMutation({ mutationFn: () => registry.renameGeoUnit(unit!.id, name), onSuccess: () => { toast.success('Renamed'); void qc.invalidateQueries({ queryKey: ['geo-units'] }); onClose(); } });
  return (
    <Dialog open={!!unit} onOpenChange={(o) => { if (o && unit) setName(unit.name); if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename {unit?.name}</DialogTitle><DialogDescription>Facilities in this area show the new name. The code ({unit?.code}) does not change.</DialogDescription></DialogHeader>
        <Input value={name || unit?.name || ''} onChange={(e) => setName(e.target.value)} aria-label="New name" />
        <DialogFooter><Button disabled={(name || '').trim().length < 2} loading={m.isPending} onClick={() => m.mutate()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
