import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CopyPlus, Info, Pencil, Plus } from 'lucide-react';
import { RecipeEditor, type EditorMode } from './recipe-editor';
import { MenuEditor } from './menu-editor';
import type { RecipeDto, SchoolCategory } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Page, PageHeader, Section } from '@/components/shared/page';
import { QueryBoundary } from '@/components/shared/states';
import { StatusBadge } from '@/components/shared/status';
import { Progress } from '@/components/ui/progress';
import { meals, registry } from '@/lib/api';
import { num, qty } from '@/lib/format';
import { MEAL_LABEL } from '@/config/status';
import { useCan } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CATS: { key: SchoolCategory; label: string }[] = [{ key: 'PRIMARY', label: 'Primary (I–V)' }, { key: 'UPPER_PRIMARY', label: 'Upper primary (VI–VIII)' }];

export default function NutritionPage() {
  const recipes = useQuery(meals.recipes());
  const menus = useQuery(meals.menus());
  const tenant = useQuery(registry.tenant());
  const canManage = useCan('nutrition:manage');
  const [editor, setEditor] = useState<EditorMode>();
  const [menuFor, setMenuFor] = useState<string>();
  return (
    <Page>
      <PageHeader title="Menus & nutrition" description="Approved recipes, what each serving is expected to provide, and the weekly menu cycle." actions={canManage && <Button onClick={() => setEditor({ kind: 'new' })}><Plus /> New recipe</Button>} />
      <RecipeEditor mode={editor} onClose={() => setEditor(undefined)} />
      <MenuEditor programmeCode={menuFor} menu={menus.data?.find((m) => m.programmeCode === menuFor)} tenant={tenant.data} recipes={recipes.data ?? []} onClose={() => setMenuFor(undefined)} />
      <div role="note" className="flex items-start gap-3 rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-sm text-info">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>Values are <strong>estimates</strong> calculated from recipe quantities and reference nutrient tables (IFCT). They are not laboratory results and do not show what an individual child consumed or absorbed. Norms are configurable per state.</p>
      </div>
      <QueryBoundary query={recipes}>{(rs) => (
        <div className="grid gap-6 lg:grid-cols-2">{rs.map((r) => <RecipeCard key={r.id} r={r} onEdit={setEditor} />)}</div>
      )}</QueryBoundary>
      <Section title="Weekly menu" bodyClassName="p-0" actions={canManage && (tenant.data?.config.programmes ?? []).map((p) => <Button key={p.code} size="sm" variant="outline" onClick={() => setMenuFor(p.code)}><Pencil /> Edit {p.code}</Button>)}>
        <QueryBoundary query={menus}>{(ms) => (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50"><TableRow><TableHead className="text-xs">Programme</TableHead>{DAYS.map((d, i) => tenant.data?.config.operatingDays.includes(i) && <TableHead key={d} className="text-xs">{d}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {ms.map((m) => (
                  <TableRow key={m.programmeCode}>
                    <TableCell className="font-medium">{tenant.data?.config.programmes.find((p) => p.code === m.programmeCode)?.name ?? m.programmeCode}</TableCell>
                    {DAYS.map((d, i) => tenant.data?.config.operatingDays.includes(i) && (
                      <TableCell key={d} className="text-sm">{m.days.find((x) => x.dayOfWeek === i)?.meals.map((x) => recipes.data?.find((r) => r.code === x.recipeCode && r.status === 'APPROVED')?.name ?? x.recipeCode).join(', ') ?? '—'}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}</QueryBoundary>
      </Section>
    </Page>
  );
}

function RecipeCard({ r, onEdit }: { r: RecipeDto; onEdit: (m: EditorMode) => void }) {
  const qc = useQueryClient();
  const canManage = useCan('nutrition:manage');
  const approve = useMutation({ mutationFn: () => meals.approveRecipe(r.id), onSuccess: () => { toast.success(`${r.name} v${r.version} approved`); void qc.invalidateQueries({ queryKey: ['recipes'] }); } });
  return (
    <Section title={r.name} description={`${MEAL_LABEL[r.mealType]} · ${r.code} v${r.version}${r.description ? ` · ${r.description}` : ''}`}
      actions={<><StatusBadge kind="recipe" value={r.status} />
        {canManage && r.status === 'DRAFT' && <Button size="sm" variant="ghost" onClick={() => onEdit({ kind: 'edit', recipe: r })}><Pencil /> Edit</Button>}
        {canManage && r.status === 'APPROVED' && <Button size="sm" variant="ghost" onClick={() => onEdit({ kind: 'version', from: r })}><CopyPlus /> New version</Button>}
        {canManage && r.status === 'DRAFT' && <Button size="sm" onClick={() => approve.mutate()} loading={approve.isPending}>Approve</Button>}</>}>
      <div className="grid gap-5 sm:grid-cols-2">
        {CATS.map((c) => {
          const est = r.estimate[c.key];
          const chk = r.normCheck[c.key];
          return (
            <div key={c.key} className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              {[['Energy', est.energyKcal, 'kcal', chk.energyPct], ['Protein', est.proteinG, 'g', chk.proteinPct]].map(([label, v, u, p]) => (
                <div key={String(label)}>
                  <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="num"><strong>{num(Number(v))}</strong> {u} <span className={cn('text-xs', Number(p) >= 100 ? 'text-success' : 'text-warning')}>{p}% of norm</span></span></div>
                  <Progress value={Number(p)} tone={Number(p) >= 100 ? 'primary' : 'warning'} label={`${label} against norm`} />
                </div>
              ))}
              <p className="text-xs text-muted-foreground num">Iron {num(est.ironMg)} mg · calcium {num(est.calciumMg)} mg · fat {num(est.fatG)} g</p>
            </div>
          );
        })}
      </div>
      <details className="mt-4 border-t pt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Ingredients per serving</summary>
        <ul className="mt-2 space-y-1">
          {r.ingredients.map((i) => <li key={i.commodityId} className="flex justify-between gap-3"><span>{i.commodityName}</span><span className="text-muted-foreground num">{qty(i.perServing.PRIMARY, i.unit)} / {qty(i.perServing.UPPER_PRIMARY, i.unit)}</span></li>)}
        </ul>
      </details>
    </Section>
  );
}
