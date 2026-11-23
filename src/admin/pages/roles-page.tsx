import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Lock, Plus, RotateCcw } from 'lucide-react';
import { PERMISSION_GROUPS, ROLE_LABELS, ROLE_PERMISSIONS, ROLES, type AccessConfig, type CustomRole, type Permission, type Role } from '@nt/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { LoadingBlock } from '@/components/shared/states';
import { adminApi, registry } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Key = Role | `custom:${string}`;
const same = (a: Permission[], b: Permission[]) => a.length === b.length && a.every((p) => b.includes(p));

/**
 * Roles & access — StaTwig's role editor: pick a role, switch permissions on or off
 * by group. Changes apply at each user's next sign-in or token refresh (≤ 15 minutes).
 */
export default function RolesPage() {
  const qc = useQueryClient();
  const tenant = useQuery(registry.tenant());
  const stats = useQuery(adminApi.userStats());
  const [draft, setDraft] = useState<AccessConfig>({ overrides: {}, customRoles: [] });
  const [selected, setSelected] = useState<Key>('SCHOOL_HEAD');
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (tenant.data) setDraft({ overrides: { ...(tenant.data.config.access?.overrides ?? {}) }, customRoles: [...(tenant.data.config.access?.customRoles ?? [])] }); }, [tenant.data]);
  const saved = tenant.data?.config.access;
  const dirty = JSON.stringify(draft) !== JSON.stringify({ overrides: saved?.overrides ?? {}, customRoles: saved?.customRoles ?? [] });
  const save = useMutation({ mutationFn: () => registry.saveAccess(draft), onSuccess: () => { toast.success('Access saved. Users get the change at their next sign-in or within 15 minutes.'); void qc.invalidateQueries({ queryKey: ['tenant'] }); } });

  const permsOf = (k: Key): Permission[] => (k.startsWith('custom:') ? draft.customRoles?.find((r) => r.id === k.slice(7))?.permissions ?? [] : draft.overrides?.[k as Role] ?? ROLE_PERMISSIONS[k as Role]);
  const locked = selected === 'SUPER_ADMIN';
  const current = permsOf(selected);
  const setPerms = (next: Permission[]) => setDraft((d) => {
    if (selected.startsWith('custom:')) return { ...d, customRoles: d.customRoles?.map((r) => (r.id === selected.slice(7) ? { ...r, permissions: next } : r)) };
    const role = selected as Role;
    const overrides = { ...d.overrides };
    if (same(next, ROLE_PERMISSIONS[role])) delete overrides[role]; else overrides[role] = next;
    return { ...d, overrides };
  });
  const toggle = (p: Permission, on: boolean) => setPerms(on ? [...current, p] : current.filter((x) => x !== p));
  const custom = draft.customRoles ?? [];
  const label = useMemo(() => (k: Key) => (k.startsWith('custom:') ? custom.find((r) => r.id === k.slice(7))?.name ?? 'Custom role' : ROLE_LABELS[k as Role]), [custom]);

  if (tenant.isPending) return <Page><LoadingBlock rows={8} /></Page>;
  return (
    <Page>
      <PageHeader title="Roles & access" description="What each role can see and do in this state. Area restrictions always apply on top: a district role only ever sees its district."
        actions={<>
          <Button variant="outline" onClick={() => setCreating(true)}><Plus /> New role</Button>
          <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>
        </>} />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Section bodyClassName="p-2">
          <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">System roles</p>
          {ROLES.map((r) => (
            <RoleButton key={r} active={selected === r} onClick={() => setSelected(r)} name={ROLE_LABELS[r]} users={stats.data?.byRole[r]} modified={!!draft.overrides?.[r]} />
          ))}
          {custom.length > 0 && <p className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">Custom roles</p>}
          {custom.map((r) => (
            <RoleButton key={r.id} active={selected === `custom:${r.id}`} onClick={() => setSelected(`custom:${r.id}`)} name={r.name} sub={`Based on ${ROLE_LABELS[r.baseRole]}`} inactive={!r.active} />
          ))}
        </Section>
        <div className="space-y-4">
          <Section title={label(selected)} description={locked ? 'The platform administrator always has every permission.' : `${current.length} permissions switched on.`}
            actions={!locked && (selected.startsWith('custom:')
              ? <label className="flex items-center gap-2 text-sm">Active<Switch checked={custom.find((r) => r.id === selected.slice(7))?.active} onCheckedChange={(a) => setDraft((d) => ({ ...d, customRoles: d.customRoles?.map((r) => (r.id === selected.slice(7) ? { ...r, active: a } : r)) }))} /></label>
              : draft.overrides?.[selected as Role] && <Button size="sm" variant="ghost" onClick={() => setPerms(ROLE_PERMISSIONS[selected as Role])}><RotateCcw /> Reset to default</Button>)}>
            {locked ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" /> Locked</p> : (
              <div className="grid gap-5 xl:grid-cols-2">
                {PERMISSION_GROUPS.filter((g) => g.key !== 'admin' || true).map((g) => (
                  <fieldset key={g.key} className="rounded-md border">
                    <legend className="ml-3 px-1 text-sm font-medium">{g.label}</legend>
                    <ul className="divide-y">
                      {g.permissions.filter((p) => p.key !== 'tenant:switch').map((p) => (
                        <li key={p.key} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="text-sm">{p.label}{p.description && <span className="block text-xs text-muted-foreground">{p.description}</span>}</span>
                          <Switch checked={current.includes(p.key)} onCheckedChange={(on) => toggle(p.key, on)} aria-label={`${p.label} for ${label(selected)}`} />
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
      <NewRoleDialog open={creating} onClose={() => setCreating(false)} onCreate={(r) => { setDraft((d) => ({ ...d, customRoles: [...(d.customRoles ?? []), r] })); setSelected(`custom:${r.id}`); }} />
    </Page>
  );
}

function RoleButton({ active, onClick, name, sub, users, modified, inactive }: { active: boolean; onClick: () => void; name: string; sub?: string; users?: number; modified?: boolean; inactive?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent', active && 'bg-accent font-medium')}>
      <span className="min-w-0 flex-1"><span className={cn('block truncate', inactive && 'text-muted-foreground line-through')}>{name}</span>{sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}</span>
      {modified && <Badge tone="trace">edited</Badge>}
      {users !== undefined && <span className="text-xs text-muted-foreground num">{users}</span>}
    </button>
  );
}

function NewRoleDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (r: CustomRole) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseRole, setBaseRole] = useState<Role>('BLOCK_COORDINATOR');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New role</DialogTitle><DialogDescription>A custom role starts as a copy of a system role. The base role decides how the person's area works and which screen they land on.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="rn">Name</Label><Input id="rn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Block food inspector" /></div>
          <div className="space-y-1.5"><Label>Based on</Label>
            <Select value={baseRole} onValueChange={(v) => setBaseRole(v as Role)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.filter((r) => r !== 'SUPER_ADMIN').map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rd">Description</Label><Textarea id="rd" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter><Button disabled={name.trim().length < 3} onClick={() => { onCreate({ id: `r${Date.now().toString(36)}`, name: name.trim(), description, baseRole, permissions: [...ROLE_PERMISSIONS[baseRole]], active: true }); setName(''); setDescription(''); onClose(); }}><Copy /> Create from {ROLE_LABELS[baseRole]}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
