import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight, Boxes, ChefHat, ClipboardCheck, FileSpreadsheet, Fingerprint, Languages, Lock, MapPinned, ScanSearch, Server, Settings2, ShieldCheck, ShoppingCart, Truck, UserCheck, WifiOff,
} from 'lucide-react';
import { CUSTODY_STAGES, STATE_PRESETS } from '@nt/domain';
import { STAGE_COLOR, STAGE_LABEL } from '@/components/shared/custody-ribbon';
import { BrandMark } from '@/app/layouts/app-sidebar';
import { cn } from '@/lib/utils';

const img = (name: string) => `${import.meta.env.BASE_URL}landing/${name}`;

const JOURNEY = [
  { who: 'Procurement officer', title: 'The batch is born', body: 'A supplier’s dispatch is recorded against an approved order. The batch gets a code and a QR label.' },
  { who: 'State warehouse', title: 'Counted and checked', body: 'Received, accepted and rejected are entered separately. Quality is tested before anything moves on.' },
  { who: 'District store', title: 'Sent where it is needed', body: 'Schools raise indents; the store approves and ships the batches that expire first.' },
  { who: 'Driver and school', title: 'The last mile', body: 'One truck, many schools. Each hand-over is recorded with who received it, when and where.' },
  { who: 'Kitchen', title: 'Cooked from known batches', body: 'Every meal batch records which rice, dal and egg lots went into the pot.' },
  { who: 'Headmaster', title: 'Served and reported', body: 'Children present and children served are reported each day, linked back to the source.' },
];

const STORIES = [
  {
    image: 'command-centre.webp', alt: 'Command centre showing children fed of those present, school reporting and stock cover by district',
    title: 'Know by noon whether every child present was fed',
    body: 'The command centre puts the programme’s outcome first: children fed out of children present, school by school, district by district — with the supply chain behind it.',
    points: ['Schools that have not reported, by block', 'Stock cover in days for every commodity', 'Districts ranked by the gaps that matter'],
  },
  {
    image: 'last-mile.webp', alt: 'Last-mile board listing today’s school stops, the trip, the driver and who received each delivery',
    title: 'Watch every truck reach every school',
    body: 'Deliveries are planned as trips. The driver’s phone records arrivals and hand-overs; the school confirms what actually arrived. Gaps raise a case on their own.',
    points: ['Proof of delivery at every stop', 'Short deliveries flagged at the school gate', 'Failed stops re-planned the same day'],
  },
  {
    image: 'recall.webp', alt: 'Recall screen listing every facility that received a recalled lot, quantities left and acknowledgements',
    title: 'Pull a bad batch back in minutes, not weeks',
    body: 'When a laboratory finds a problem, the custody record already knows every warehouse and school that received the batch, how much is left, and who has set it aside.',
    points: ['Every place that received the batch', 'Quantity still on the shelf at each', 'Acknowledgement tracked to closure'],
  },
];

const MODULES = [
  { icon: ShoppingCart, title: 'Procurement & indents', body: 'Orders to approved suppliers with two-officer approval. Schools and stores request stock from the level above.' },
  { icon: Boxes, title: 'Inventory', body: 'Batch-wise stock at every store with expiry, first-expiry-first-out and approved write-offs.' },
  { icon: ChefHat, title: 'Kitchens & schools', body: 'Daily menu, ingredients needed, cooking records and the daily meal report — offline if needed.' },
  { icon: Truck, title: 'Shipments & last mile', body: 'Planned shipments, delivery trips, driver run sheets and proof of delivery at the school.', wide: true },
  { icon: ClipboardCheck, title: 'Quality & recalls', body: 'Inspections hold failing batches automatically; recalls run from the custody record.' },
  { icon: ScanSearch, title: 'Track & trace', body: 'Follow any batch forward to the meals it became, or any school’s meals back to the supplier. Every entry is hash-chained to the one before it, so the record cannot be quietly changed.', full: true, accent: true },
];

const AUDIENCES = [
  { title: 'State department', points: ['One view of every district, every day', 'Evidence for audits and the Assembly', 'Supplier performance on record'] },
  { title: 'District and block officers', points: ['A list of what needs attention today', 'Late trucks and missing reports, not spreadsheets', 'Approvals in one place'] },
  { title: 'Headmasters and kitchen staff', points: ['A short daily report on a phone', 'Works without signal; sends when back', 'Knows what is coming and when'] },
  { title: 'Auditors and citizens', points: ['A tamper-evident custody record', 'Read-only audit access', 'QR labels that show where food came from'] },
];

const TRUST = [
  { icon: Fingerprint, title: 'Role and area-based access', body: 'Each person sees only their district, block or school. Enforced on the server.' },
  { icon: Lock, title: 'Tamper-evident record', body: 'Every custody entry is chained to the one before it with a SHA-256 hash.' },
  { icon: FileSpreadsheet, title: 'Every change audited', body: 'Who changed what, and when — kept for review and inspection.' },
  { icon: UserCheck, title: 'No child-level data', body: 'Only counts of children are recorded, in line with India’s data-protection principles.' },
  { icon: Server, title: 'Deployable in India', body: 'Runs in a State Data Centre or a government cloud, with your own keys.' },
  { icon: WifiOff, title: 'Built for low connectivity', body: 'Field entries are saved on the device and sent once, when signal returns.' },
  { icon: Languages, title: 'Indian languages', body: 'Interface in English, Tamil, Hindi and Kannada, with more added per state.' },
  { icon: Settings2, title: 'Open data in, open data out', body: 'Bulk import from UDISE+ and state lists; export any register to CSV.' },
];

const FAQ = [
  { q: 'Does NutriTrace replace our existing portal?', a: 'No. It is the custody and evidence layer for the food itself — batches, movements, receipts and meals. It can run alongside an existing MIS and exchange data with it where the state allows.' },
  { q: 'How much do schools have to type?', a: 'Very little: confirm what arrived, record what was cooked, and report children present and served. Dates, times, locations and batch links are recorded by the platform.' },
  { q: 'What happens where there is no mobile signal?', a: 'Reports and receipts are saved on the phone and sent automatically when the connection returns. The server recognises a resent entry and never records it twice.' },
  { q: 'Can it follow our state’s structure and programmes?', a: 'Yes. Level names, languages, programmes, nutrition norms and alert thresholds are configured per state. Districts, schools, suppliers and users can be loaded in bulk.' },
  { q: 'Are the nutrition figures laboratory results?', a: 'No. They are estimates from recipe quantities and national food composition tables, clearly labelled as such, to show whether menus meet the norms.' },
];

function TextSize() {
  const [size, setSize] = useState(100);
  useEffect(() => {
    document.documentElement.style.fontSize = `${size}%`;
    return () => { document.documentElement.style.fontSize = ''; };
  }, [size]);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Text size">
      {[[90, 'A-', 'Smaller text'], [100, 'A', 'Normal text'], [112.5, 'A+', 'Larger text']].map(([v, l, label]) => (
        <button key={String(v)} type="button" onClick={() => setSize(Number(v))} aria-label={String(label)} aria-pressed={size === v}
          className={cn('rounded px-1.5 py-0.5 hover:bg-white/10', size === v && 'bg-white/15 text-white')}>{l}</button>
      ))}
    </div>
  );
}

/** Framed product screen: browser chrome for desktop, a phone bezel for mobile. */
function Screen({ src, alt, className, phone, eager }: { src: string; alt: string; className?: string; phone?: boolean; eager?: boolean }) {
  return phone ? (
    <div className={cn('rounded-[2rem] border-[6px] border-[#0b1512] bg-[#0b1512] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)]', className)}>
      <img src={img(src)} alt={alt} className="block w-full rounded-[1.5rem]" loading={eager ? 'eager' : 'lazy'} />
    </div>
  ) : (
    <figure className={cn('overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_40px_80px_-30px_rgba(18,48,42,0.45)]', className)}>
      <div className="flex items-center gap-1.5 border-b border-black/5 bg-[#eef2f0] px-3 py-2" aria-hidden>
        <span className="size-2.5 rounded-full bg-[#d8dfdc]" /><span className="size-2.5 rounded-full bg-[#d8dfdc]" /><span className="size-2.5 rounded-full bg-[#d8dfdc]" />
        <span className="ml-3 h-4 flex-1 rounded bg-white/80" />
      </div>
      <img src={img(src)} alt={alt} className="block w-full" loading={eager ? 'eager' : 'lazy'} />
    </figure>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to main content</a>

      {/* Utility bar, as on government portals */}
      <div className="bg-[#0b1f1a] text-[13px] text-white/75">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-1.5">
          <span className="hidden sm:inline">School nutrition supply chain platform for state programmes</span>
          <div className="ml-auto flex items-center gap-4">
            <a href="#main" className="hover:text-white">Skip to content</a>
            <TextSize />
            <Link to="/login" className="hover:text-white">Sign in</Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5">
          <Link to="/home" className="flex items-center gap-2.5" aria-label="NutriTrace home">
            <BrandMark className="size-9" />
            <span className="leading-tight"><span className="block text-lg font-bold tracking-tight">NutriTrace</span><span className="block text-[11px] text-muted-foreground">Powered by StaTwig</span></span>
          </Link>
          <nav aria-label="Sections" className="ml-6 hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            {[['How it works', '#journey'], ['Product', '#product'], ['Modules', '#modules'], ['For whom', '#audiences'], ['Security', '#trust'], ['Questions', '#faq']].map(([l, h]) => <a key={h} href={h} className="hover:text-foreground">{l}</a>)}
          </nav>
          <Link to="/login" className="ml-auto inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary/90">Sign in <ArrowRight className="size-4" /></Link>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden bg-[#12302a] text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '22px 22px' }} aria-hidden />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pt-16 pb-10 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
            <div className="max-w-xl">
              <h1 className="text-[2.5rem] leading-[1.08] font-bold tracking-tight sm:text-5xl lg:text-[3.6rem]">Every batch of food, followed to the child who eats it.</h1>
              <p className="mt-6 text-lg leading-relaxed text-white/80">NutriTrace records each hand-off in a state’s school-meal supply chain — supplier, warehouse, truck, kitchen and school — so officials know where food is, whether it arrived, and that children were fed.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/login" className="inline-flex h-12 items-center gap-2 rounded-md bg-trace px-6 font-semibold text-[#2b1d03] hover:bg-trace/90">Sign in to NutriTrace <ArrowRight className="size-4" /></Link>
                <a href="#journey" className="inline-flex h-12 items-center rounded-md border border-white/25 px-6 font-medium hover:bg-white/10">See how it works</a>
              </div>
              <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-6 text-sm">
                <div><dt className="text-white/60">Custody stages</dt><dd className="mt-1 text-2xl font-semibold">6</dd></div>
                <div><dt className="text-white/60">Roles, one platform</dt><dd className="mt-1 text-2xl font-semibold">13</dd></div>
                <div><dt className="text-white/60">State presets</dt><dd className="mt-1 text-2xl font-semibold">{STATE_PRESETS.length}</dd></div>
              </dl>
            </div>
            <div className="relative pb-10 lg:pb-0">
              <Screen src="lot-journey.webp" alt="A rice batch’s journey: six custody stages, where every kilogram went, and the record’s completeness" className="lg:translate-x-6" eager />
              <Screen phone src="run-sheet.webp" alt="A driver’s run sheet on a phone with three school stops" className="absolute -bottom-2 -left-2 w-[30%] min-w-28 sm:-left-8" eager />
            </div>
          </div>
          {/* The custody ribbon — the platform's signature, as the hero's base */}
          <div className="relative mx-auto max-w-7xl px-5 pb-12">
            <div className="relative grid grid-cols-6 gap-1" aria-label="Custody stages: source, state warehouse, district store, kitchen, school, meal served">
              {CUSTODY_STAGES.map((s) => (
                <div key={s}>
                  <div className="h-2.5 rounded-full" style={{ background: STAGE_COLOR[s] }} />
                  <p className="mt-2 hidden text-xs text-white/70 sm:block">{STAGE_LABEL[s]}</p>
                </div>
              ))}
              <span className="nt-grain absolute -top-1 left-0 size-4.5 rounded-full border-2 border-[#12302a] bg-trace shadow-[0_0_0_4px_rgba(217,154,30,0.25)]" aria-hidden />
            </div>
          </div>
          <style>{`@keyframes nt-grain { from { left: 0 } to { left: calc(100% - 1.1rem) } } .nt-grain { animation: nt-grain 3.2s cubic-bezier(.45,.05,.3,1) .4s both } @media (prefers-reduced-motion: reduce) { .nt-grain { animation: none; left: calc(100% - 1.1rem) } }`}</style>
        </section>

        {/* Journey */}
        <section id="journey" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-7xl px-5">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">From the supplier’s gate to the school plate</h2>
              <p className="mt-4 text-lg text-muted-foreground">Six hand-offs, each recorded by the person who holds the food at that moment. Nothing is assumed from the step before.</p>
            </div>
            <ol className="mt-12 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-6">
              {JOURNEY.map((j, i) => {
                const stage = CUSTODY_STAGES[i]!;
                return (
                  <li key={j.title} className="relative">
                    <div className="h-1.5 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
                    <p className="mt-4 text-sm font-semibold num" style={{ color: STAGE_COLOR[stage] }}>{i + 1}</p>
                    <h3 className="mt-1 text-lg font-semibold leading-snug">{j.title}</h3>
                    <p className="mt-1 text-sm font-medium text-muted-foreground">{j.who}</p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{j.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Product stories */}
        <section id="product" className="scroll-mt-20 border-y bg-[#e3ece7] py-20">
          <div className="mx-auto max-w-7xl space-y-24 px-5">
            {STORIES.map((s, i) => (
              <div key={s.title} className={cn('grid items-center gap-10 lg:grid-cols-[1fr_1.35fr]', i % 2 && 'lg:grid-cols-[1.35fr_1fr]')}>
                <div className={cn('max-w-lg', i % 2 && 'lg:order-2')}>
                  <h2 className="text-3xl font-bold leading-tight tracking-tight">{s.title}</h2>
                  <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{s.body}</p>
                  <ul className="mt-6 space-y-2.5">
                    {s.points.map((p) => <li key={p} className="flex items-start gap-3"><span className="mt-2 h-1.5 w-5 shrink-0 rounded-full bg-trace" aria-hidden />{p}</li>)}
                  </ul>
                </div>
                <Screen src={s.image} alt={s.alt} className={cn(i % 2 && 'lg:order-1')} />
              </div>
            ))}
          </div>
        </section>

        {/* Modules */}
        <section id="modules" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-7xl px-5">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Two portals. One record.</h2>
                <p className="mt-4 text-lg text-muted-foreground">An operations portal where the work happens, and an Admin Console where the state configures people, places and products.</p>
              </div>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {MODULES.map((m) => (
                <article key={m.title} className={cn('rounded-xl border bg-card p-6', 'wide' in m && m.wide && 'md:col-span-2', 'full' in m && m.full && 'md:col-span-3', 'accent' in m && m.accent && 'border-trace/40 bg-trace-soft/50')}>
                  <m.icon className={cn('size-6', 'accent' in m && m.accent ? 'text-trace-ink' : 'text-primary')} aria-hidden />
                  <h3 className="mt-4 text-lg font-semibold">{m.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
                </article>
              ))}
              <article className="rounded-xl bg-[#1b2430] p-6 text-white md:col-span-3 md:flex md:items-center md:gap-10">
                <div className="md:w-1/3">
                  <Settings2 className="size-6 text-trace" aria-hidden />
                  <h3 className="mt-4 text-lg font-semibold">Admin Console</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-white/75 md:mt-0 md:flex-1">Users and their roles, what each role may do, levels and locations, schools and facilities, products, suppliers and vehicles — managed in one place, loaded in bulk from UDISE+ and state lists, exported at any time, with every change in the audit trail.</p>
              </article>
            </div>
          </div>
        </section>

        {/* Audiences */}
        <section id="audiences" className="scroll-mt-20 border-y bg-card py-20">
          <div className="mx-auto max-w-7xl px-5">
            <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Built for everyone who answers for a school meal</h2>
            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {AUDIENCES.map((a, i) => (
                <div key={a.title} className="bg-card p-6">
                  <div className="h-1 w-10 rounded-full" style={{ background: STAGE_COLOR[CUSTODY_STAGES[[1, 2, 4, 5][i]!]!] }} aria-hidden />
                  <h3 className="mt-4 text-lg font-semibold">{a.title}</h3>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">{a.points.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="scroll-mt-20 bg-[#12302a] py-20 text-white">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[1fr_2fr]">
            <div>
              <ShieldCheck className="size-8 text-trace" aria-hidden />
              <h2 className="mt-4 text-3xl font-bold tracking-tight">Designed for public accountability</h2>
              <p className="mt-4 text-white/75">A government platform must be fair to its users, safe with its data, and able to prove what happened. These are built in, not added later.</p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-xl bg-white/10 sm:grid-cols-2">
              {TRUST.map((t) => (
                <div key={t.title} className="flex gap-4 bg-[#12302a] p-5">
                  <t.icon className="mt-0.5 size-5 shrink-0 text-trace" aria-hidden />
                  <div><h3 className="font-semibold">{t.title}</h3><p className="mt-1 text-sm text-white/70">{t.body}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* States */}
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-5">
            <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
              <div>
                <MapPinned className="size-7 text-primary" aria-hidden />
                <h2 className="mt-4 text-3xl font-bold tracking-tight">Configured for each state, not rebuilt</h2>
                <p className="mt-4 text-muted-foreground">Each state starts from a preset with its own administrative levels, languages and programmes, then tunes norms and alert thresholds to its policy.</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {STATE_PRESETS.map((p) => (
                  <li key={p.code} className="rounded-lg border bg-card px-4 py-3">
                    <p className="font-semibold">{p.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{p.hierarchyLevels.join(' › ')}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.programmes.map((x) => x.name).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t bg-[#eef3f0] py-20">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="text-3xl font-bold tracking-tight">Questions officials ask</h2>
            <div className="mt-8 divide-y rounded-xl border bg-card">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{f.q}<span className="text-xl text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>+</span></summary>
                  <p className="mt-3 text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Pilot CTA */}
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-5">
            <div className="relative overflow-hidden rounded-2xl bg-primary px-8 py-14 text-white sm:px-14">
              <div className="absolute inset-x-0 bottom-0 grid grid-cols-6 gap-1 px-1 pb-1" aria-hidden>{['#b08a45', '#d1a23a', '#b8b445', '#8fbf5c', '#62b585', '#a8dcc0'].map((c) => <span key={c} className="h-1.5 rounded-full" style={{ background: c }} />)}</div>
              <div className="grid items-center gap-8 lg:grid-cols-[2fr_1fr]">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Start with one district</h2>
                  <p className="mt-4 max-w-2xl text-lg text-white/85">A twelve-week pilot — one district, two blocks, about sixty schools and three commodities — measured on traceability, delivery reliability and children fed of those present.</p>
                </div>
                <div className="flex flex-wrap gap-3 lg:justify-end">
                  <a href="https://www.statwig.com" target="_blank" rel="noreferrer" className="inline-flex h-12 items-center rounded-md bg-white px-6 font-semibold text-primary hover:bg-white/90">Talk to StaTwig</a>
                  <Link to="/login" className="inline-flex h-12 items-center rounded-md border border-white/40 px-6 font-medium hover:bg-white/10">Sign in</Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0b1f1a] text-sm text-white/70">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5"><BrandMark className="size-8" /><span className="text-lg font-semibold text-white">NutriTrace</span></div>
            <p className="mt-3">School nutrition supply chain intelligence for state governments. Powered by StaTwig.</p>
          </div>
          <div><p className="font-semibold text-white">Platform</p><ul className="mt-3 space-y-2"><li><a href="#journey" className="hover:text-white">How it works</a></li><li><a href="#modules" className="hover:text-white">Modules</a></li><li><a href="#trust" className="hover:text-white">Security</a></li></ul></div>
          <div><p className="font-semibold text-white">Access</p><ul className="mt-3 space-y-2"><li><Link to="/login" className="hover:text-white">Sign in</Link></li><li><a href="#faq" className="hover:text-white">Questions</a></li></ul></div>
          <div><p className="font-semibold text-white">Accessibility</p><p className="mt-3">This site supports keyboard navigation, screen readers and adjustable text size. Report an accessibility problem to the programme helpdesk.</p></div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-5 py-5 text-xs text-white/50">
            <p>© {new Date().getFullYear()} StaTwig. NutriTrace is a StaTwig platform for state school-nutrition programmes.</p>
            <p>Screens shown on this page use simulated data.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
