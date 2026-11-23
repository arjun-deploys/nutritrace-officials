import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Sparkles } from 'lucide-react';
import { ROLE_LABELS } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PERSONAS, DEMO_PASSWORD } from '@/mocks/personas';
import { sessionFor, setPersona } from '@/mocks/index';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const STATES: { code: string; name: string; note: string }[] = [
  { code: 'TN', name: 'Tamil Nadu', note: 'Full pitch scenario: rice batch, moong dal recall, indents, a trip on the road.' },
  { code: 'KA', name: 'Karnataka', note: 'District › Taluk, Kannada interface.' },
  { code: 'UP', name: 'Uttar Pradesh', note: 'Division › District › Block, Hindi interface.' },
];
const GROUP: Record<string, string> = {
  STATE_ADMIN: 'Leadership', SUPER_ADMIN: 'Leadership', AUDITOR: 'Leadership', DISTRICT_ADMIN: 'Administration', DISTRICT_OFFICER: 'District & block', BLOCK_COORDINATOR: 'District & block',
  WAREHOUSE_OPERATOR: 'Supply chain', TRANSPORT_COORDINATOR: 'Supply chain', PROCUREMENT_OFFICER: 'Supply chain', QUALITY_INSPECTOR: 'Quality & nutrition', NUTRITIONIST: 'Quality & nutrition', SCHOOL_HEAD: 'Schools',
};

export function useSwitchPersona() {
  const setSession = useAuthStore((s) => s.setSession);
  const setGeo = useUiStore((s) => s.setGeoPath);
  const navigate = useNavigate();
  return (id: string, to?: string) => {
    setPersona(id);
    const session = sessionFor(id);
    setGeo(null);
    setSession(session.accessToken, session.user);
    const u = session.user;
    const home = u.role === 'SCHOOL_HEAD' && u.facilityId ? `/schools/${u.facilityId}` : u.role === 'KITCHEN_MANAGER' ? '/kitchen' : u.role === 'DISTRICT_ADMIN' ? '/admin' : '/';
    // Navigate last: any role-based redirect on the current screen runs first, then the destination wins.
    setTimeout(() => navigate(to ?? home), 50);
  };
}

/** Compact strip above the sign-in form; the full role list opens in a dialog. */
export function PersonaPicker() {
  const [open, setOpen] = useState(false);
  const sw = useSwitchPersona();
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-trace/40 bg-trace-soft/60 px-4 py-3">
        <Sparkles className="size-5 shrink-0 text-trace-ink" aria-hidden />
        <div className="min-w-0 flex-1 basis-40 text-sm"><p className="font-medium">Demo environment</p><p className="text-xs text-muted-foreground">Simulated data. Explore as any role.</p></div>
        <Button size="sm" variant="trace" className="w-full sm:w-auto" onClick={() => setOpen(true)}>Choose a role</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <DialogTitle>Explore NutriTrace as…</DialogTitle>
            <DialogDescription>Each person sees only their own area and the actions their role allows. Password for typed sign-in: <code className="rounded bg-muted px-1">{DEMO_PASSWORD}</code></DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="TN" className="px-6 pb-6">
            <TabsList className="mt-4">{STATES.map((s) => <TabsTrigger key={s.code} value={s.code}>{s.name}</TabsTrigger>)}</TabsList>
            {STATES.map((st) => {
              const people = PERSONAS.filter((p) => p.tenant === st.code);
              const groups = [...new Set(people.map((p) => GROUP[p.role] ?? 'Other'))];
              return (
                <TabsContent key={st.code} value={st.code} className="mt-3 max-h-[58vh] space-y-5 overflow-y-auto pr-1">
                  <p className="text-sm text-muted-foreground">{st.note}</p>
                  {groups.map((g) => (
                    <div key={g}>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">{g}</p>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {people.filter((p) => (GROUP[p.role] ?? 'Other') === g).map((p) => (
                          <li key={p.id}>
                            <button type="button" onClick={() => { setOpen(false); sw(p.id); }} className="group flex h-full w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent">
                              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{p.name.replace(/^(Dr\.|Smt\.|Shri)\s*/, '').split(' ').map((w) => w.replace(/[^\p{L}]/gu, '')[0]).filter(Boolean).slice(0, 2).join('')}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">{ROLE_LABELS[p.role]}</span>
                                <span className="block text-xs text-muted-foreground">{p.name}</span>
                                <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{p.story}</span>
                              </span>
                              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </TabsContent>
              );
            })}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
