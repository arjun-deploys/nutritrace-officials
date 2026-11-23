import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { FACILITY_BOUND_ROLES, ROLE_LABELS, ROLES, userCreateSchema, type Role, type UserCreateInput, type UserDto } from '@nt/domain';
import { KeyRound, Plus, Copy, Pencil } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';


import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { Field, FormError, FormSelect } from '@/components/shared/form';
import { FacilityPicker } from '@/components/shared/facility-picker';
import { useTableParams } from '@/hooks/use-table-params';
import { identity, registry } from '@/lib/api';
import { ago } from '@/lib/format';
import { useUser } from '@/stores/auth';
import { toast } from 'sonner';
import { ExchangeActions } from '@/admin/components/exchange';

export default function UsersPage() {
  const { params, setParam } = useTableParams({ sort: 'name', order: 'asc' });
  const q = useQuery(identity.users(params));
  const [temp, setTemp] = useState<{ name: string; pw: string }>();
  const [editing, setEditing] = useState<UserDto>();
  const reset = useMutation({ mutationFn: (u: UserDto) => identity.resetPassword(u.id).then((r) => ({ name: u.name, pw: r.temporaryPassword })), onSuccess: setTemp });
  const columns: ColumnDef<UserDto, unknown>[] = [
    { header: 'Name', cell: ({ row }) => <div><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.username}{row.original.phone && ` · ${row.original.phone}`}</p></div>, meta: { sortKey: 'name' } },
    { header: 'Role', cell: ({ row }) => ROLE_LABELS[row.original.role], meta: { sortKey: 'role' } },
    { header: 'Scope', cell: ({ row }) => <span className="block max-w-72 truncate text-sm">{row.original.scopeLabel}</span> },
    { header: 'Last sign-in', cell: ({ row }) => ago(row.original.lastLoginAt), meta: { sortKey: 'lastLoginAt' } },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="user" value={row.original.status} /> },
    { id: 'act', header: '', cell: ({ row }) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(row.original); }}><Pencil /> Edit</Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); reset.mutate(row.original); }}><KeyRound /> Reset password</Button>
      </div>
    ) },
  ];
  return (
    <Page>
      <PageHeader title="Users" description="Each person has one role and one area — or one facility for headmasters, kitchen and warehouse staff. The server enforces both on every request." actions={<><ExchangeActions entity="users" invalidate={['users', 'user-stats']} /><CreateUserDialog /></>} />
      <DataTable columns={columns} query={q} params={params} setParam={setParam} searchPlaceholder="Name, username or phone"
            filters={[{ key: 'role', label: 'Role', options: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })) }]} />
      <EditUserDialog user={editing} onClose={() => setEditing(undefined)} />
      <Dialog open={!!temp} onOpenChange={(o) => !o && setTemp(undefined)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Temporary password for {temp?.name}</DialogTitle><DialogDescription>Shown once. Share it in person or by phone; the user must change it at next sign-in. Their other sessions have been ended.</DialogDescription></DialogHeader>
          <div className="flex items-center gap-2 rounded-md bg-muted p-3"><code className="flex-1 text-lg">{temp?.pw}</code><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(temp?.pw ?? '').then(() => toast.success('Copied'))}><Copy /> Copy</Button></div>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function CreateUserDialog() {
  const me = useUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const geo = useQuery(registry.geoUnits());
  const form = useForm<UserCreateInput>({ resolver: zodResolver(userCreateSchema), defaultValues: { name: '', username: '', email: '', phone: '', role: 'BLOCK_COORDINATOR', geoPath: me.geoPath, password: '' } });
  const role = form.watch('role') as Role;
  const needsFacility = FACILITY_BOUND_ROLES.includes(role);
  const m = useMutation({
    mutationFn: identity.createUser,
    meta: { silent: true },
    onSuccess: (u) => { toast.success(`${u.name} can now sign in as ${u.username}`); setOpen(false); form.reset(); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => setError((e as Error).message),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Onboard user</Button></DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Add user</DialogTitle><DialogDescription>Give the least access needed: the narrowest area, or a single facility for field roles.</DialogDescription></DialogHeader>
        <form id="new-user" className="grid gap-3 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => { setError(undefined); m.mutate(v); })} noValidate>
          <div className="sm:col-span-2"><FormError message={error} /></div>
          <Field label="Full name" error={e.name} required><Input {...form.register('name')} /></Field>
          <Field label="Username" error={e.username} required><Input {...form.register('username')} autoCapitalize="none" /></Field>
          <Field label="Mobile" error={e.phone}><Input inputMode="tel" {...form.register('phone')} /></Field>
          <Field label="Email" error={e.email}><Input type="email" {...form.register('email')} /></Field>
          <FormSelect control={form.control} name="role" label="Role" required options={ROLES.filter((r) => r !== 'SUPER_ADMIN' || me.role === 'SUPER_ADMIN').map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          <FormSelect control={form.control} name="geoPath" label="Area" required options={(geo.data ?? []).map((g) => ({ value: g.geoPath, label: `${'— '.repeat(g.level)}${g.name} (${g.levelName})` }))} />
          {needsFacility && <Controller control={form.control} name="facilityId" render={({ field }) => <Field label="Facility" required className="sm:col-span-2"><FacilityPicker value={field.value} onChange={(id) => field.onChange(id)} /></Field>} />}
          <Field label="Initial password" error={e.password} required hint="12+ characters with upper, lower and a digit. The user changes it at first sign-in." className="sm:col-span-2"><Input type="text" autoComplete="new-password" {...form.register('password')} /></Field>
        </form>
        <DialogFooter><Button type="submit" form="new-user" loading={m.isPending}>Create user</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Change role, area or facility, or suspend. Any change of access ends the user's current sessions. */
function EditUserDialog({ user, onClose }: { user?: UserDto; onClose: () => void }) {
  const me = useUser();
  const qc = useQueryClient();
  const geo = useQuery(registry.geoUnits());
  const [role, setRole] = useState<Role>('BLOCK_COORDINATOR');
  const [geoPath, setGeoPath] = useState('');
  const [facilityId, setFacilityId] = useState<string>();
  const [customRoleId, setCustomRoleId] = useState<string>('none');
  const [active, setActive] = useState(true);
  const tenant = useQuery(registry.tenant());
  const customRoles = (tenant.data?.config.access?.customRoles ?? []).filter((r) => r.active && r.baseRole === role);
  const [error, setError] = useState<string>();
  const m = useMutation({
    mutationFn: () => identity.updateUser(user!.id, { role, geoPath, facilityId: FACILITY_BOUND_ROLES.includes(role) ? facilityId : undefined, customRoleId: customRoleId === 'none' ? '' : customRoleId, status: active ? 'ACTIVE' : 'SUSPENDED' }),
    meta: { silent: true },
    onSuccess: (u) => { toast.success(`${u.name} updated`); void qc.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  const self = user?.id === me.id;
  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (o && user) { setRole(user.role); setGeoPath(user.geoPath); setFacilityId(user.facilityId); setCustomRoleId(user.customRoleId || 'none'); setActive(user.status === 'ACTIVE'); setError(undefined); } if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {user?.name}</DialogTitle><DialogDescription>Changing role, area or status signs the user out everywhere so the new access applies immediately.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <FormError message={error} />
          {self && <p className="text-sm text-muted-foreground">You cannot change your own role or status.</p>}
          <div className="space-y-1.5"><Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={self}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.filter((r) => r !== 'SUPER_ADMIN' || me.role === 'SUPER_ADMIN').map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Area</Label>
            <Select value={geoPath} onValueChange={setGeoPath}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(geo.data ?? []).map((g) => <SelectItem key={g.id} value={g.geoPath}>{`${'— '.repeat(g.level)}${g.name} (${g.levelName})`}</SelectItem>)}</SelectContent></Select>
          </div>
          {customRoles.length > 0 && <div className="space-y-1.5"><Label>Custom role</Label>
            <Select value={customRoleId} onValueChange={setCustomRoleId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Standard {ROLE_LABELS[role].toLowerCase()} permissions</SelectItem>{customRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select>
          </div>}
          {FACILITY_BOUND_ROLES.includes(role) && <div className="space-y-1.5"><Label>Facility</Label><FacilityPicker value={facilityId} onChange={(id) => setFacilityId(id)} /></div>}
          <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>Active<span className="block text-xs text-muted-foreground">Suspended users cannot sign in; their history stays.</span></span><Switch checked={active} onCheckedChange={setActive} disabled={self} /></label>
        </div>
        <DialogFooter><Button loading={m.isPending} disabled={FACILITY_BOUND_ROLES.includes(role) && !facilityId} onClick={() => m.mutate()}>Save changes</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
