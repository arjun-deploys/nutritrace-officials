import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileDown, FileUp, KeyRound } from 'lucide-react';
import { EXCHANGE, parseCsv, toCsv, type ExchangeEntity, type ImportResult } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormError } from '@/components/shared/form';
import { exchange } from '@/lib/api';
import { isApiError } from '@/lib/http';
import { useCan } from '@/stores/auth';
import { toast } from 'sonner';

const save = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/csv' }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};
export const downloadTemplate = (entity: ExchangeEntity) => {
  const d = EXCHANGE[entity];
  save(`${entity}-template.csv`, toCsv(d.example.map((r) => Object.fromEntries(d.columns.map((c, i) => [c, r[i] ?? '']))), d.columns));
};

/** Import & export buttons for one entity: used on every Admin Console list. */
export function ExchangeActions({ entity, invalidate }: { entity: ExchangeEntity; invalidate: string[] }) {
  const [open, setOpen] = useState(false);
  const canImport = useCan('data:import');
  const canExport = useCan('data:export');
  const exp = useMutation({ mutationFn: () => exchange.export(entity), onSuccess: () => toast.success('Export downloaded'), meta: { silent: true }, onError: (e) => toast.error(isApiError(e) ? e.message : 'Export failed') });
  return (
    <>
      {canExport && <Button variant="outline" onClick={() => exp.mutate()} loading={exp.isPending}><FileDown /> Export</Button>}
      {canImport && <Button variant="outline" onClick={() => setOpen(true)}><FileUp /> Import</Button>}
      <ImportWizard entity={entity} open={open} onClose={() => setOpen(false)} invalidate={invalidate} />
    </>
  );
}

/** Template → choose file → check (nothing saved) → import. Identical for every entity. */
export function ImportWizard({ entity, open, onClose, invalidate }: { entity: ExchangeEntity; open: boolean; onClose: () => void; invalidate: string[] }) {
  const d = EXCHANGE[entity];
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState<string>();
  const [check, setCheck] = useState<ImportResult>();
  const [done, setDone] = useState<ImportResult>();
  const [error, setError] = useState<string>();
  const reset = () => { setRows([]); setFileName(undefined); setCheck(undefined); setDone(undefined); setError(undefined); };
  const run = useMutation({
    mutationFn: (dryRun: boolean) => exchange.import(entity, rows, dryRun), meta: { silent: true },
    onSuccess: (r, dryRun) => {
      if (dryRun) setCheck(r);
      else {
        setDone(r);
        toast.success(`${d.label}: ${r.created} added, ${r.updated} updated`);
        for (const k of [...invalidate, 'exchange-history', 'audit']) void qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (e) => setError((e as Error).message),
  });
  const onFile = async (f?: File) => {
    if (!f) return;
    reset();
    const parsed = parseCsv(await f.text());
    const required = [d.keyColumn, 'name'].filter((c) => d.columns.includes(c));
    const missing = required.filter((c) => !parsed[0] || !(c in parsed[0]));
    if (!parsed.length) return setError('The file has no data rows.');
    if (missing.length) return setError(`The file is missing columns: ${missing.join(', ')}. Download the template to see the expected header.`);
    setFileName(f.name);
    setRows(parsed);
  };
  const preview = d.columns.slice(0, 6);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import {d.label.toLowerCase()}</DialogTitle>
          <DialogDescription>{d.description} Rows are matched on <strong>{d.keyColumn}</strong>: new ones are added, existing ones updated. Nothing is saved until the whole file passes the check.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <FormError message={error} />
          {d.notes.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => downloadTemplate(entity)}><Download /> Download template</Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-card px-4 py-2 font-medium hover:bg-accent">
              <FileUp className="size-4" /> {fileName ?? 'Choose CSV file'}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            {rows.length > 0 && <span className="text-muted-foreground num">{rows.length} rows read</span>}
          </div>
          {rows.length > 0 && !check && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader><TableRow>{preview.map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{rows.slice(0, 5).map((r, i) => <TableRow key={i}>{preview.map((h) => <TableCell key={h} className="text-xs">{r[h]}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
              {rows.length > 5 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">…and {rows.length - 5} more</p>}
            </div>
          )}
          {check && !done && (check.errors.length ? (
            <div className="space-y-2">
              <p className="font-medium text-danger">{check.errors.length} row(s) need fixing. Nothing has been saved.</p>
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead className="text-xs">Row</TableHead><TableHead className="text-xs">{d.keyColumn}</TableHead><TableHead className="text-xs">Problem</TableHead></TableRow></TableHeader>
                  <TableBody>{check.errors.map((er) => <TableRow key={`${er.row}-${er.message}`}><TableCell className="num">{er.row}</TableCell><TableCell className="code-id">{er.code}</TableCell><TableCell className="whitespace-normal">{er.message}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">Fix these in the spreadsheet and choose the file again.</p>
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-success"><CheckCircle2 className="size-4" /> All {check.total} rows are valid: {check.created} new, {check.updated} to update.</p>
          ))}
          {done && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-success"><CheckCircle2 className="size-4" /> Imported: {done.created} added, {done.updated} updated.</p>
              {!!done.credentials?.length && (
                <div className="space-y-2 rounded-md border border-warning/40 bg-warning-soft p-3">
                  <p className="flex items-center gap-2 font-medium text-warning"><KeyRound className="size-4" /> Temporary passwords — shown once</p>
                  <p className="text-xs text-muted-foreground">Download and hand over securely. Each user must change it at first sign-in.</p>
                  <Button size="sm" variant="outline" onClick={() => save(`credentials-${Date.now()}.csv`, toCsv(done.credentials!))}><Download /> Download {done.credentials.length} credentials</Button>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          {!check && <Button disabled={!rows.length} loading={run.isPending} onClick={() => { setError(undefined); run.mutate(true); }}>Check file</Button>}
          {check && !check.errors.length && !done && <Button loading={run.isPending} onClick={() => run.mutate(false)}>Import {check.total} rows</Button>}
          {check && check.errors.length > 0 && <Button variant="outline" onClick={reset}>Choose another file</Button>}
          {done && <Button onClick={() => { reset(); onClose(); }}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
