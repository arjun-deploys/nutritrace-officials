import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Compass, RotateCcw, Users } from 'lucide-react';
import { ROLE_LABELS } from '@nt/domain';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { PERSONAS } from '@/mocks/personas';
import { getStore } from '@/mocks/seed/simulate';
import { setPersona } from '@/mocks/index';
import { clearJournal } from '@/mocks/journal';
import { useAuthStore } from '@/stores/auth';
import { useSwitchPersona } from './personas-panel';

interface Step { title: string; body: string; persona: string; to: string }

/** The pitch, in order. Every link lands on live simulated data. */
function useGuide(): Step[] {
  return useMemo(() => {
    const s = getStore('TN');
    const rice = s.lots.find((l) => l.commodity.code === 'RICE')!;
    const recall = s.recalls[0];
    const late = s.shipments.find((x) => x.status === 'DELAYED');
    const head = s.users.find((u) => u.persona === 'tn-head')!;
    const inbound = s.shipments.find((x) => x.to.id === head.facilityId && x.status === 'IN_TRANSIT');
    const po = s.pos.find((p) => p.status === 'PENDING_APPROVAL');
    const short = s.exceptions.find((e) => e.type === 'MEAL_SHORTFALL' && e.status !== 'RESOLVED');
    return [
      { title: 'The state at a glance', body: 'Children fed of those present, schools reporting, deliveries on time — and the districts that need attention first.', persona: 'tn-state', to: '/' },
      { title: `Trace ${rice.code}: 10,000 kg to the plate`, body: 'Procured 10,000 kg, 9,980 accepted (20 kg short at the warehouse), followed to every school and meal. Hash-verified.', persona: 'tn-state', to: `/trace/lots/${rice.id}` },
      ...(recall ? [{ title: 'Recall in minutes, not weeks', body: 'Aflatoxin found in a moong dal lot. The ledger lists every warehouse and school that received it, what is left, and who has acknowledged.', persona: 'tn-qc', to: `/quality/recalls/${recall.id}` }] : []),
      ...(short ? [{ title: 'Children present but not fed', body: 'The rule engine flags it the moment the school reports, routes it to the block coordinator and starts the clock.', persona: 'tn-state', to: `/exceptions?open=${short.id}` }] : []),
      ...(late ? [{ title: 'A truck that never arrived', body: 'Last GPS fix, delay hours, and an exception for the transport coordinator. Location never counts as delivery.', persona: 'tn-state', to: `/logistics/shipments/${late.id}` }] : []),
      ...(inbound ? [{ title: 'Headmaster receives today’s delivery', body: 'Enter 12 fewer eggs than dispatched: a discrepancy case opens by itself, and the truck’s stop on its trip closes with this receipt as proof of delivery.', persona: 'tn-head', to: `/logistics/shipments/${inbound.id}/receive` }] : []),
      ...(s.indents.find((i) => i.status === 'SUBMITTED') ? [{ title: 'A school asks for more (indent)', body: 'The headmaster raised an indent for eggs and rice. The district warehouse approves the quantities and fulfils it with one click — lots are picked first-expiry-first-out.', persona: 'tn-wh', to: `/indents/${s.indents.find((i) => i.status === 'SUBMITTED')!.id}` }] : []),
      ...(s.trips[0] ? [{ title: 'Last mile: the driver’s run sheet', body: 'One truck, three schools. The driver arrives, records who took the goods, and the board updates for the district — stop by stop.', persona: 'tn-driver', to: `/last-mile/trips/${s.trips[0].id}` }] : []),
      { title: 'Cook and serve today’s lunch', body: 'In the kitchen, record cooking: ingredients are issued lot by lot (FEFO). Then report present and served under Schools — the meal is now traceable to its source.', persona: 'tn-head', to: '/kitchen' },
      ...(po ? [{ title: 'Two people for every big decision', body: 'The procurement officer raised this order; only a different officer can approve it.', persona: 'tn-state', to: `/procurement/orders/${po.id}` }] : []),
      { title: 'A lot that failed quality checks', body: 'Toor dal with 15.8% moisture was held automatically. It cannot be dispatched until a decision is recorded.', persona: 'tn-qc', to: '/quality/inspections?undecided=true' },
      { title: 'Setting up a state', body: 'Locations, schools (one by one or a UDISE+ spreadsheet), suppliers, food items, recipes and users — all managed here, all audited.', persona: 'tn-state', to: '/admin/locations' },
      { title: 'One platform, every state', body: 'Karnataka runs District › Taluk in Kannada; Uttar Pradesh runs Division › District › Block in Hindi. Same code.', persona: 'ka-state', to: '/' },
    ];
  }, []);
}

export function DemoBar() {
  const user = useAuthStore((s) => s.user);
  const sw = useSwitchPersona();
  const steps = useGuide();
  const [open, setOpen] = useState(false);
  const state = user?.tenantId === 'KA' ? 'Karnataka' : user?.tenantId === 'UP' ? 'Uttar Pradesh' : 'Tamil Nadu';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-trace px-4 py-1.5 text-sm text-[#2b1d03] md:px-5">
      <p className="font-medium">Demo · {state}</p>
      <p className="hidden text-[#2b1d03]/80 lg:block">Simulated programme data — districts are real places; schools, people and figures are fictional.</p>
      <div className="ml-auto flex items-center gap-1">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild><Button size="sm" variant="ghost" className="h-7 hover:bg-black/10"><Compass /> Pitch guide</Button></SheetTrigger>
          <SheetContent className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader><SheetTitle>Pitch guide</SheetTitle><SheetDescription>Each step signs you in as the right person and opens the screen.</SheetDescription></SheetHeader>
            <ol className="space-y-2 px-4 pb-6">
              {steps.map((st, i) => (
                <li key={st.title}>
                  <button type="button" className="w-full rounded-md border p-3 text-left hover:border-primary hover:bg-accent" onClick={() => { setOpen(false); sw(st.persona, st.to); }}>
                    <p className="text-sm font-medium"><span className="mr-2 text-trace-ink num">{i + 1}</span>{st.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{st.body}</p>
                    <p className="mt-1.5 text-xs text-primary">As {ROLE_LABELS[PERSONAS.find((p) => p.id === st.persona)!.role].toLowerCase()}</p>
                  </button>
                </li>
              ))}
            </ol>
          </SheetContent>
        </Sheet>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-7 hover:bg-black/10"><Users /> <span className="hidden sm:inline">Switch person</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Sign in as</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PERSONAS.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => sw(p.id)} className="flex-col items-start gap-0">
                <span>{ROLE_LABELS[p.role]}{p.tenant !== 'TN' && ` (${p.tenant})`}</span>
                <span className="text-xs text-muted-foreground">{p.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="ghost" className="h-7 hover:bg-black/10" onClick={() => { setPersona(undefined); clearJournal(); localStorage.removeItem('nt-offline-queue'); window.location.assign('/login'); }} title="Discard all changes and start again">
          <RotateCcw /> <span className="hidden sm:inline">Reset</span>
        </Button>
      </div>
      <Link to="/" className="sr-only">Home</Link>
    </div>
  );
}
