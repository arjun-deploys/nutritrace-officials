import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { INSPECTION_RESULTS, INSPECTION_TYPES, type CapaDto, type InspectionDto, type InspectionResult, type InspectionType } from '@nt/domain';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader } from '@/components/shared/page';
import { DataTable } from '@/components/data-table/data-table';
import { StatusBadge } from '@/components/shared/status';
import { LotLink } from '@/components/shared/links';
import { ReasonDialog } from '@/components/shared/reason-dialog';
import { FacilityPicker } from '@/components/shared/facility-picker';
import { FormError } from '@/components/shared/form';
import { useTableParams } from '@/hooks/use-table-params';
import { quality, trace } from '@/lib/api';
import { date, dateTime, humanize } from '@/lib/format';
import { statusOf } from '@/config/status';
import { useCan } from '@/stores/auth';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useDebounced } from '@/hooks/use-debounced';

export default function InspectionsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'inspections';
  const canInspect = useCan('quality:inspect');
  return (
    <Page>
      <PageHeader title="Inspections" description="Quality evidence for each lot. A failed inspection puts the lot on hold automatically until a decision is recorded." actions={canInspect && <InspectDialog />} />
      <Tabs value={tab} onValueChange={(v) => setSp(new URLSearchParams({ tab: v }))}><TabsList><TabsTrigger value="inspections">Inspections</TabsTrigger><TabsTrigger value="capa">Corrective actions</TabsTrigger></TabsList></Tabs>
      {tab === 'inspections' ? <InspectionsTable /> : <CapaTable />}
    </Page>
  );
}

function InspectionsTable() {
  const { params, setParam } = useTableParams();
  const q = useQuery(quality.inspections(params));
  const qc = useQueryClient();
  const canDecide = useCan('quality:decide');
  const decide = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'RELEASE' | 'HOLD' | 'REJECT'; reason: string }) => quality.decide(id, { decision, reason }),
    onSuccess: (i) => { toast.success(`${i.lot?.code}: ${humanize(i.decision?.decision)}`); void qc.invalidateQueries(); },
  });
  const columns: ColumnDef<InspectionDto, unknown>[] = [
    { header: 'Ref', cell: ({ row }) => <span className="code-id">{row.original.inspectionNo}</span> },
    { header: 'Type', cell: ({ row }) => humanize(row.original.type) },
    { header: 'Lot', cell: ({ row }) => (row.original.lot ? <LotLink id={row.original.lot.id} code={row.original.lot.code} /> : '—') },
    { header: 'Facility', cell: ({ row }) => <span className="block max-w-48 truncate">{row.original.facility.name}</span> },
    { header: 'Sampled', cell: ({ row }) => dateTime(row.original.sampledAt), meta: { sortKey: 'sampledAt' } },
    { header: 'Failed checks', cell: ({ row }) => <span className="text-sm">{row.original.parameters.filter((p) => !p.passed).map((p) => p.name).join(', ') || '—'}</span> },
    { header: 'Result', cell: ({ row }) => <StatusBadge kind="inspection" value={row.original.result} /> },
    { header: 'Decision', cell: ({ row }) => {
      const i = row.original;
      if (i.decision) return <Badge tone={i.decision.decision === 'RELEASE' ? 'success' : 'danger'}>{humanize(i.decision.decision)}</Badge>;
      if (!i.lot || !canDecide) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex gap-1">
          {i.result !== 'FAIL' && <ReasonDialog trigger={<Button size="sm">Release</Button>} title={`Release ${i.lot.code}`} description="The lot becomes usable for issue and dispatch." confirmLabel="Release" onConfirm={(reason) => decide.mutateAsync({ id: i.id, decision: 'RELEASE', reason })} />}
          <ReasonDialog trigger={<Button size="sm" variant="outline">Hold</Button>} title={`Hold ${i.lot.code}`} confirmLabel="Hold" onConfirm={(reason) => decide.mutateAsync({ id: i.id, decision: 'HOLD', reason })} />
          <ReasonDialog trigger={<Button size="sm" variant="outline">Reject</Button>} title={`Reject ${i.lot.code}`} confirmLabel="Reject" destructive onConfirm={(reason) => decide.mutateAsync({ id: i.id, decision: 'REJECT', reason })} />
        </div>
      );
    } },
  ];
  return <DataTable columns={columns} query={q} params={params} setParam={setParam}
    filters={[{ key: 'result', label: 'Result', options: INSPECTION_RESULTS.map((r) => ({ value: r, label: statusOf('inspection', r).label })) }, { key: 'undecided', label: 'Decision', options: [{ value: 'true', label: 'Awaiting decision' }] }]}
    empty={{ title: 'No inspections recorded' }} />;
}

const NEXT_CAPA: Record<string, { status: string; label: string }> = { OPEN: { status: 'IN_PROGRESS', label: 'Start work' }, IN_PROGRESS: { status: 'PENDING_VERIFICATION', label: 'Mark done' }, PENDING_VERIFICATION: { status: 'CLOSED', label: 'Verify and close' } };

function CapaTable() {
  const { params, setParam } = useTableParams({ sort: 'dueDate', order: 'asc' });
  const q = useQuery(quality.capas(params));
  const qc = useQueryClient();
  const canAct = useCan('quality:inspect');
  const [creating, setCreating] = useState(false);
  const step = useMutation({ mutationFn: ({ id, status, note }: { id: string; status: string; note: string }) => quality.updateCapa(id, { status, note }), onSuccess: (c) => { toast.success(`${c.capaNo}: ${statusOf('capa', c.status).label}`); void qc.invalidateQueries({ queryKey: ['capa'] }); } });
  const columns: ColumnDef<CapaDto, unknown>[] = [
    { header: 'Ref', cell: ({ row }) => <span className="code-id">{row.original.capaNo}</span> },
    { header: 'Action', cell: ({ row }) => <div className="max-w-md"><p className="font-medium">{row.original.title}</p><p className="truncate text-xs text-muted-foreground">{row.original.description}</p></div> },
    { header: 'Facility', cell: ({ row }) => row.original.facility.name },
    { header: 'Owner', cell: ({ row }) => row.original.ownerName },
    { header: 'Due', cell: ({ row }) => <span className={row.original.overdue ? 'font-medium text-danger' : undefined}>{date(row.original.dueDate)}</span>, meta: { sortKey: 'dueDate' } },
    { header: 'Status', cell: ({ row }) => <StatusBadge kind="capa" value={row.original.status} /> },
    { id: 'next', header: '', cell: ({ row }) => {
      const n = NEXT_CAPA[row.original.status];
      return canAct && n ? <ReasonDialog trigger={<Button size="sm" variant="outline">{n.label}</Button>} title={`${row.original.capaNo}: ${n.label.toLowerCase()}`} description="Record what was done; this note is kept in the action's history." confirmLabel={n.label} minLength={3} onConfirm={(note) => step.mutateAsync({ id: row.original.id, status: n.status, note })} /> : null;
    } },
  ];
  return <>
    {canAct && <div className="flex justify-end"><Button onClick={() => setCreating(true)}><Plus /> Raise corrective action</Button></div>}
    <CapaDialog open={creating} onClose={() => setCreating(false)} />
    <DataTable columns={columns} query={q} params={params} setParam={setParam} empty={{ title: 'No corrective actions' }}
    filters={[{ key: 'status', label: 'Status', options: ['OPEN', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'CLOSED'].map((s) => ({ value: s, label: statusOf('capa', s).label })) }]} />
  </>;
}

function CapaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ title: '', description: '', facilityId: '', ownerName: '', dueDate: '', severity: 'MEDIUM', source: 'INSPECTION' });
  const [error, setError] = useState<string>();
  const m = useMutation({
    mutationFn: () => quality.createCapa(v as never), meta: { silent: true },
    onSuccess: (c) => { toast.success(`${c.capaNo} raised`); void qc.invalidateQueries({ queryKey: ['capa'] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  const ok = v.title.length >= 5 && v.description.length >= 10 && v.facilityId && v.ownerName.length >= 2 && v.dueDate;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Raise corrective action</DialogTitle><DialogDescription>Fix the cause, not just the symptom. The action moves from open to verified closure.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <FormError message={error} />
          <div className="space-y-1.5"><Label htmlFor="ct">What needs to change</Label><Input id="ct" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Moisture checks on toor dal at dispatch" /></div>
          <div className="space-y-1.5"><Label htmlFor="cd">Details</Label><Textarea id="cd" rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Facility</Label><FacilityPicker value={v.facilityId} onChange={(id) => setV({ ...v, facilityId: id })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="co">Owner</Label><Input id="co" value={v.ownerName} onChange={(e) => setV({ ...v, ownerName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="cdd">Due by</Label><Input id="cdd" type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Severity</Label><Select value={v.severity} onValueChange={(s) => setV({ ...v, severity: s })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <SelectItem key={s} value={s}>{statusOf('severity', s).label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Raised from</Label><Select value={v.source} onValueChange={(s) => setV({ ...v, source: s })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{['INSPECTION', 'RECALL', 'COMPLAINT', 'AUDIT'].map((s) => <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </div>
        <DialogFooter><Button disabled={!ok} loading={m.isPending} onClick={() => m.mutate()}>Raise</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Param { name: string; value: string; unit: string; limit: string; passed: boolean }
const DEFAULT_PARAMS: Param[] = [
  { name: 'Moisture', value: '', unit: '%', limit: '≤ 14', passed: true },
  { name: 'Foreign matter', value: '', unit: '%', limit: '≤ 1', passed: true },
  { name: 'Insect damage', value: '', unit: '%', limit: '≤ 2', passed: true },
];

function InspectDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<InspectionType>('RECEIPT');
  const [facilityId, setFacilityId] = useState('');
  const [lotQ, setLotQ] = useState('');
  const [lotId, setLotId] = useState('');
  const [params, setParams] = useState<Param[]>(DEFAULT_PARAMS);
  const [result, setResult] = useState<InspectionResult>('PASS');
  const [remarks, setRemarks] = useState('');
  const [labRef, setLabRef] = useState('');
  const [error, setError] = useState<string>();
  const dq = useDebounced(lotQ);
  const lots = useQuery({ ...trace.lots({ q: dq, pageSize: 8 }), enabled: dq.length >= 2 });
  const m = useMutation({
    mutationFn: () => quality.inspect({ type, facilityId, lotId: lotId || undefined, sampledAt: new Date().toISOString(), labRef: labRef || undefined, result, remarks: remarks || undefined, evidence: [], parameters: params.filter((p) => p.value).map((p) => ({ ...p, unit: p.unit || undefined, limit: p.limit || undefined })) }),
    meta: { silent: true },
    onSuccess: (i) => { toast.success(`${i.inspectionNo} recorded${i.result === 'FAIL' ? ' — lot placed on hold' : ''}`); setOpen(false); void qc.invalidateQueries(); },
    onError: (e) => setError((e as Error).message),
  });
  const anyFail = params.some((p) => p.value && !p.passed);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Record inspection</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Record inspection</DialogTitle><DialogDescription>Record each parameter measured. A failing result holds the lot immediately.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Type</Label><Select value={type} onValueChange={(v) => setType(v as InspectionType)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{INSPECTION_TYPES.map((t) => <SelectItem key={t} value={t}>{humanize(t)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Facility</Label><FacilityPicker value={facilityId} onChange={setFacilityId} /></div>
            <div className="space-y-1.5"><Label htmlFor="lotq">Lot</Label><Input id="lotq" value={lotQ} onChange={(e) => { setLotQ(e.target.value); setLotId(''); }} placeholder="Type a lot code" className="code-id uppercase" />
              {!lotId && lots.data?.data.length ? <ul className="rounded-md border text-sm">{lots.data.data.map((l) => <li key={l.id}><button type="button" className="w-full px-3 py-1.5 text-left hover:bg-accent" onClick={() => { setLotId(l.id); setLotQ(l.code); }}><span className="code-id">{l.code}</span> <span className="text-muted-foreground">{l.commodity.name}</span></button></li>)}</ul> : null}
            </div>
            <div className="space-y-1.5"><Label htmlFor="lab">Laboratory reference</Label><Input id="lab" value={labRef} onChange={(e) => setLabRef(e.target.value)} /></div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Parameters</legend>
            {params.map((p, i) => (
              <div key={i} className="grid grid-cols-[1.4fr_1fr_0.6fr_0.9fr_auto_auto] items-center gap-2">
                {(['name', 'value', 'unit', 'limit'] as const).map((k) => <Input key={k} value={p[k]} placeholder={humanize(k)} aria-label={k} onChange={(e) => setParams((ps) => ps.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />)}
                <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={p.passed} onCheckedChange={(v) => setParams((ps) => ps.map((x, j) => (j === i ? { ...x, passed: v === true } : x)))} />Pass</label>
                <Button variant="ghost" size="icon-sm" onClick={() => setParams((ps) => ps.filter((_, j) => j !== i))} aria-label="Remove parameter"><Trash2 /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setParams((ps) => [...ps, { name: '', value: '', unit: '', limit: '', passed: true }])}><Plus /> Add parameter</Button>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Overall result</Label><Select value={result} onValueChange={(v) => setResult(v as InspectionResult)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{INSPECTION_RESULTS.map((r) => <SelectItem key={r} value={r} disabled={r === 'PASS' && anyFail}>{statusOf('inspection', r).label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rmk">Remarks</Label><Textarea id="rmk" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <DialogFooter><Button disabled={!facilityId || !params.some((p) => p.value)} loading={m.isPending} onClick={() => { setError(undefined); m.mutate(); }}>Save inspection</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
