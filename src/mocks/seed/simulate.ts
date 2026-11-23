import {
  allocateFefo, DEFAULT_COMMODITIES, defaultTenantConfig, estimateServing, lotCode, permissionsFor, round, rules, STATE_PRESETS,
  type ActorRef, type CommodityDto, type FacilityDto, type GeoUnitDto, type LotDto, type MealType, type NutritionRef, type PoDto, type SchoolCategory,
  type ShipmentDto, type SupplierDto, type TraceEventDto, type Unit, type Role, type IndentDto,
} from '@nt/domain';
import { createRng } from '../rng';
import { audit, autoResolve, available, cell, facRef, moveStock, newId, nextLotSeq, nextNo, raise, sealAll, trace } from '../ops';
import type { DemoUser, RecipeRow, TenantStore } from '../store';
import { MENU, RECIPES, TENANT_SPECS } from './specs';
import { PERSONAS } from '../personas';

/* ───────────── time helpers (local time, demo "today" = real today) ───────────── */
const midnight = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
export const at = (offset: number, h = 10, m = 0) => new Date(midnight.getTime() + offset * 86_400_000 + (h * 60 + m) * 60_000);
export const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function buildTenant(code: string): TenantStore {
  const spec = TENANT_SPECS[code]!;
  const preset = STATE_PRESETS.find((p) => p.code === code)!;
  const rng = createRng(spec.seed);
  const config = defaultTenantConfig(preset);
  const todayDow = midnight.getDay();
  if (!config.operatingDays.includes(todayDow)) config.operatingDays = [...config.operatingDays, todayDow].sort();
  config.languages = preset.languages;

  const s: TenantStore = {
    tenant: { id: code, code, name: preset.name, shortName: code, isDemo: true, config },
    geo: [], facilities: [], facilityById: new Map(), commodities: [], suppliers: [], vehicles: [], users: [], pos: [], asns: [], lots: [], lotById: new Map(),
    stock: new Map(), ledger: [], grns: [], adjustments: [], shipments: [], reservations: new Map(), recipes: [], menus: [], productions: [], services: [], hygiene: [],
    inspections: [], capas: [], recalls: [], events: [], pending: [], sealed: false, byLot: new Map(), byProduction: new Map(), exceptions: [], notifications: [],
    audit: [], indents: [], trips: [], counters: {}, now: new Date(),
  };

  /* ── Master data ── */
  const lv = config.hierarchyLevels;
  const geo = (code_: string, name: string, level: number, parentId: string | null, geoPath: string): GeoUnitDto => {
    const g = { id: `g-${geoPath}`, tenantId: code, code: code_, name, level, levelName: lv[level]!, parentId, geoPath };
    s.geo.push(g);
    return g;
  };
  const stateUnit = geo(code, preset.name, 0, null, code);
  const addFacility = (f: Omit<FacilityDto, 'tenantId' | 'active'>) => {
    const full = { ...f, tenantId: code, active: true } as FacilityDto;
    s.facilities.push(full);
    s.facilityById.set(full.id, full);
    return full;
  };
  const stateWh = addFacility({ id: newId(s), code: `${code}-SWH-01`, name: spec.stateWarehouse.name, type: 'STATE_WAREHOUSE', geoUnitId: stateUnit.id, geoPath: code, districtName: preset.name, location: { lat: spec.stateWarehouse.lat, lng: spec.stateWarehouse.lng }, storageCapacityKg: 500_000, inCharge: { name: 'R. Selvakumar', phone: '9840011223' } });

  const districtWh = new Map<string, FacilityDto>();
  const schools: FacilityDto[] = [];
  const firstNames = ['K. Meenakshi', 'S. Rajendran', 'P. Lakshmi', 'M. Arumugam', 'R. Kavitha', 'V. Senthil', 'A. Revathi', 'G. Murugan', 'T. Saranya', 'N. Balaji', 'J. Anitha', 'D. Prakash'];
  for (const d of spec.districts) {
    let parent = stateUnit;
    if (d.division) {
      parent = s.geo.find((g) => g.code === d.division!.code) ?? geo(d.division.code, d.division.name, 1, stateUnit.id, `${code}/${d.division.code}`);
    }
    const dUnit = geo(d.code, d.name, parent.level + 1, parent.id, `${parent.geoPath}/${d.code}`);
    const dwh = addFacility({ id: newId(s), code: `${code}-DWH-${d.code}`, name: `${d.name} District Warehouse`, type: 'DISTRICT_WAREHOUSE', geoUnitId: dUnit.id, geoPath: dUnit.geoPath, districtName: d.name, location: { lat: d.lat, lng: d.lng }, storageCapacityKg: 80_000, inCharge: { name: rng.pick(firstNames), phone: `94${rng.int(10000000, 99999999)}` } });
    districtWh.set(d.code, dwh);
    d.blocks.forEach((b, bi) => {
      const bUnit = geo(b.code, b.name, dUnit.level + 1, dUnit.id, `${dUnit.geoPath}/${b.code}`);
      for (let i = 0; i < spec.schoolsPerBlock; i++) {
        const primary = i % 3 !== 2;
        const village = b.villages[i % b.villages.length]!;
        const enrolment = primary ? rng.int(70, 240) : rng.int(160, 420);
        addFacility({
          id: newId(s), code: `${code}-SCH-${d.code}${b.code}${String(i + 1).padStart(2, '0')}`, name: `${primary ? spec.schoolPrefixes.primary : spec.schoolPrefixes.upper} ${village}`, type: 'SCHOOL',
          geoUnitId: bUnit.id, geoPath: bUnit.geoPath, districtName: d.name, blockName: b.name,
          location: { lat: d.lat + (bi - 0.5) * 0.18 + rng.float(-0.06, 0.06), lng: d.lng + rng.float(-0.15, 0.15) },
          address: `${village}, ${b.name} block, ${d.name}`, inCharge: { name: rng.pick(firstNames), phone: `9${rng.int(100000000, 999999999)}` },
          school: {
            udiseCode: `${spec.udisePrefix}${String(spec.districts.indexOf(d) + 1).padStart(2, '0')}${String(bi + 1).padStart(2, '0')}${String(rng.int(10000, 99999))}`,
            category: primary ? 'PRIMARY' : 'UPPER_PRIMARY', enrolment, hasKitchen: true, programmes: config.programmes.filter((p) => p.mealTypes.some((m) => m === 'LUNCH' || (primary && m === 'BREAKFAST'))).map((p) => p.code),
          },
        });
        schools.push(s.facilities[s.facilities.length - 1]!);
      }
    });
  }

  s.commodities = DEFAULT_COMMODITIES.map((c) => ({ ...c, id: `c-${c.code}`, tenantId: code, active: true }) as CommodityDto);
  const com = (c: string) => s.commodities.find((x) => x.code === c)!;
  s.suppliers = spec.suppliers.map((sp, i): SupplierDto => ({
    id: `s-${sp.code}`, tenantId: code, code: sp.code, name: sp.name, gstin: `${spec.udisePrefix}AAB${'CDEFG'[i % 5]}${1000 + i * 37}Q1Z${i}`, fssaiLicence: `1${String(rng.int(1e12, 9e12))}`,
    fssaiValidUntil: localDate(sp.licenceExpired ? addDays(midnight, -40) : addDays(midnight, rng.int(150, 700))), commodityIds: sp.commodities.map((c) => `c-${c}`),
    contact: { name: rng.pick(firstNames), phone: `98${rng.int(10000000, 99999999)}`, email: '' }, address: `${sp.district} district, ${preset.name}`,
    status: sp.status ?? 'APPROVED', scorecard: { onTimePct: 0, inFullPct: 0, qualityPassPct: 0, lotsSupplied: 0 },
  }));
  const supplierFor = (c: string) => s.suppliers.find((x) => x.status === 'APPROVED' && x.commodityIds.includes(`c-${c}`))!;
  spec.districts.forEach((_d, i) => s.vehicles.push({ id: newId(s), tenantId: code, registrationNo: `${code}${String(10 + i * 7).padStart(2, '0')}${'ABCDEF'[i]}${'KLMNPR'[i]}${rng.int(1000, 9999)}`, transporterName: 'Sri Murugan Transports', capacityKg: 9000, driver: { name: rng.pick(['Raja', 'Kumar', 'Saravanan', 'Iqbal', 'Ganesh']), phone: `97${rng.int(10000000, 99999999)}` }, gpsDeviceId: `GPS-${rng.int(10000, 99999)}`, active: true }));

  /* ── People ── */
  const actor = (u: DemoUser): ActorRef => ({ userId: u.id, name: u.name, role: u.role });
  const personaSchool = schools.find((sc) => sc.geoPath.endsWith(`/${spec.persona.districtCode}/${spec.persona.blockCode}`) && sc.school!.category === 'PRIMARY')!;
  const personaDistrict = s.geo.find((g) => g.code === spec.persona.districtCode)!;
  const personaBlock = s.geo.find((g) => g.code === spec.persona.blockCode)!;
  for (const p of PERSONAS.filter((x) => x.tenant === code)) {
    const facilityId = p.scope === 'school' ? personaSchool.id : p.scope === 'district-warehouse' ? districtWh.get(spec.persona.districtCode)!.id : p.scope === 'state-warehouse' ? stateWh.id : undefined;
    const geoPath = p.scope === 'district' || p.scope === 'district-warehouse' ? personaDistrict.geoPath : p.scope === 'block' || p.scope === 'school' ? (p.scope === 'school' ? personaSchool.geoPath : personaBlock.geoPath) : code;
    const f = facilityId ? s.facilityById.get(facilityId) : undefined;
    const label = [preset.name, ...geoPath.split('/').slice(1).map((c) => s.geo.find((g) => g.code === c)?.name), f?.name].filter(Boolean).join(' › ');
    s.users.push({
      id: `u-${p.id}`, persona: p.id, name: p.name, username: p.username, role: p.role, status: 'ACTIVE', tenantId: code, geoPath, facilityId, facilityName: f?.name, scopeLabel: label,
      phone: `9${rng.int(100000000, 999999999)}`, mfaEnabled: p.role === 'STATE_ADMIN' || p.role === 'SUPER_ADMIN', createdAt: iso(at(-60)), lastLoginAt: iso(at(-rng.int(0, 3), rng.int(8, 18))),
    });
  }
  // A realistic spread of field users
  for (const sc of schools.slice(0, 18)) {
    s.users.push({ id: newId(s), name: sc.inCharge!.name!, username: `hm.${sc.code.toLowerCase().slice(-8)}`, role: 'SCHOOL_HEAD', status: 'ACTIVE', tenantId: code, geoPath: sc.geoPath, facilityId: sc.id, facilityName: sc.name, scopeLabel: sc.name, mfaEnabled: false, createdAt: iso(at(-55)), lastLoginAt: iso(at(-rng.int(0, 2), 13)) });
  }
  const U = (role: Role) => s.users.find((u) => u.role === role && u.persona) ?? s.users[0]!;
  const procurer = actor(U('PROCUREMENT_OFFICER'));
  const approver = actor(U('STATE_ADMIN'));
  const whOp = actor(U('WAREHOUSE_OPERATOR'));
  const inspector = actor(U('QUALITY_INSPECTOR'));
  const nutritionist = actor(U('NUTRITIONIST'));
  const fieldActor = (f: FacilityDto): ActorRef => {
    const u = s.users.find((x) => x.facilityId === f.id);
    return u ? actor(u) : { userId: `u-${f.id}`, name: f.inCharge?.name ?? 'Facility in-charge', role: f.type === 'SCHOOL' ? 'SCHOOL_HEAD' : 'WAREHOUSE_OPERATOR' };
  };

  /* ── Recipes & menu ── */
  for (const r of RECIPES) {
    s.recipes.push({
      id: `r-${r.code}`, code: r.code, name: r.name, mealType: r.mealType as MealType, description: r.description, version: 1, status: 'APPROVED', approvedBy: nutritionist, approvedAt: iso(at(-90)),
      ingredients: Object.entries(r.ing).map(([c, [p, u]]) => ({ commodityId: `c-${c}`, perServing: { PRIMARY: p, UPPER_PRIMARY: u } })),
    });
  }
  s.recipes.push({ id: 'r-B-RAGI-2', code: 'B-RAGI', name: 'Ragi kichadi with peanuts', mealType: 'BREAKFAST', description: 'Revised to lift protein above the breakfast norm', version: 2, status: 'DRAFT', ingredients: [...s.recipes.find((r) => r.code === 'B-RAGI')!.ingredients.map((i) => (i.commodityId === 'c-MOONG' ? { ...i, perServing: { PRIMARY: 0.02, UPPER_PRIMARY: 0.024 } } : i))] });
  s.menus = config.programmes.map((p) => ({
    programmeCode: p.code,
    days: [0, 1, 2, 3, 4, 5, 6].filter((d) => config.operatingDays.includes(d)).map((d) => ({ dayOfWeek: d, meals: p.mealTypes.filter((mt) => mt === 'LUNCH' || mt === 'BREAKFAST').map((mt) => ({ mealType: mt, recipeCode: MENU[mt as 'LUNCH' | 'BREAKFAST'][d]! })) })),
  }));
  const recipeFor = (dow: number, mt: MealType) => s.recipes.find((r) => r.code === MENU[mt as 'LUNCH' | 'BREAKFAST'][dow] && r.status === 'APPROVED')!;
  const mealTypesOf = (sc: FacilityDto) => [...new Set(config.programmes.filter((p) => sc.school!.programmes.includes(p.code)).flatMap((p) => p.mealTypes))].filter((m) => m !== 'SNACK') as MealType[];

  /* ── Plan: attendance per school per operating day ── */
  const opDays: number[] = [];
  for (let o = -(spec.days - 1); o <= 0; o++) if (config.operatingDays.includes(at(o).getDay())) opDays.push(o);
  const attendance = new Map<string, number>();
  for (const sc of schools) for (const o of opDays) attendance.set(`${sc.id}|${o}`, Math.round(sc.school!.enrolment * rng.float(0.85, 0.96)));
  const weeks: number[][] = [];
  for (const o of opDays) {
    const w = Math.floor((o + spec.days - 1) / 7);
    (weeks[w] ??= []).push(o);
  }
  const needFor = (sc: FacilityDto, days: number[]) => {
    const need = new Map<string, number>();
    for (const o of days) for (const mt of mealTypesOf(sc)) {
      const r = recipeFor(at(o).getDay(), mt);
      const n = attendance.get(`${sc.id}|${o}`)! * 1.04;
      for (const ing of r.ingredients) need.set(ing.commodityId, (need.get(ing.commodityId) ?? 0) + ing.perServing[sc.school!.category] * n);
    }
    return need;
  };
  const schoolWeekNeed = weeks.map((days) => new Map(schools.map((sc) => [sc.id, needFor(sc, days)])));
  const totalNeed = new Map<string, number>();
  for (const wk of schoolWeekNeed) for (const m of wk.values()) for (const [c, q] of m) totalNeed.set(c, (totalNeed.get(c) ?? 0) + q);
  const roundQty = (c: CommodityDto, q: number) => (c.unit === 'PIECE' ? Math.ceil(q / 30) * 30 : c.unit === 'LITRE' || q < 100 ? Math.ceil(q) : Math.ceil(q / 5) * 5);

  /* ── Procurement & lots ── */
  const pos = new Map<string, PoDto>();
  const poFor = (sup: SupplierDto, lines: { c: CommodityDto; qty: number }[], created: Date) => {
    const po: PoDto = {
      id: newId(s), tenantId: code, poNumber: nextNo(s, 'PO', created), supplier: { id: sup.id, name: sup.name, code: sup.code }, deliverTo: facRef(stateWh),
      programmeCode: config.programmes[0]!.code, contractRef: `${code}/MDM/TDR/2026/${rng.int(100, 199)}`, expectedDeliveryDate: localDate(addDays(created, 3)), status: 'APPROVED',
      lines: lines.map((l) => ({ commodityId: l.c.id, commodityName: l.c.name, unit: l.c.unit, quantity: l.qty, ratePerUnit: rng.int(20, 120), dispatched: 0, received: 0, accepted: 0, rejected: 0 })),
      history: [{ status: 'DRAFT', at: iso(created), actor: procurer }, { status: 'PENDING_APPROVAL', at: iso(created), actor: procurer }, { status: 'APPROVED', at: iso(addDays(created, 0.2)), actor: approver, comment: 'Within approved annual allocation' }],
      createdAt: iso(created), createdBy: procurer,
    };
    s.pos.push(po);
    audit(s, approver, 'procurement.po_approved', { kind: 'PO', id: po.id, label: po.poNumber }, undefined, addDays(created, 0.2));
    return po;
  };
  const supplierParty = (sup: SupplierDto) => ({ id: sup.id, name: sup.name, code: sup.code, type: 'SUPPLIER' as const, geoPath: code });

  /** Supplier dispatch: lots are born here, enter the ledger, and travel as an inbound shipment. */
  const dispatchFromSupplier = (po: PoDto, specs: { c: CommodityDto; qty: number; packed: Date; expires: Date; cert?: boolean }[], when: Date, eta: Date) => {
    const sup = s.suppliers.find((x) => x.id === po.supplier.id)!;
    const shipmentId = newId(s);
    const shipmentNo = nextNo(s, 'ASN', when);
    const lots: LotDto[] = specs.map((l) => {
      const lot: LotDto = {
        id: newId(s), tenantId: code, code: lotCode(l.c.code, code, nextLotSeq(s, l.c.code), when), commodity: { id: l.c.id, name: l.c.name, code: l.c.code, unit: l.c.unit, category: l.c.category },
        supplier: { id: sup.id, name: sup.name, code: sup.code }, supplierLotNo: `${sup.code.slice(4)}/${String(when.getFullYear()).slice(2)}/${rng.int(1000, 9999)}`, poId: po.id, poNumber: po.poNumber,
        origin: { district: spec.suppliers.find((x) => x.code === sup.code)!.district, state: preset.name }, packedOn: localDate(l.packed), expiresOn: localDate(l.expires), quantity: l.qty,
        status: 'PENDING_QC', certificateNo: l.cert === false ? undefined : `QC/${l.c.code}/${rng.int(10000, 99999)}`, currentStage: 'SOURCE', completeness: 0, createdAt: iso(when),
      };
      s.lots.push(lot);
      s.lotById.set(lot.id, lot);
      const line = po.lines.find((x) => x.commodityId === l.c.id)!;
      line.dispatched = round(line.dispatched + l.qty);
      trace(s, { type: 'LOT_CREATED', occurredAt: iso(when), lotId: lot.id, lotCode: lot.code, commodityId: l.c.id, quantity: l.qty, unit: l.c.unit, quantityKind: 'PROCURED', from: supplierParty(sup), refs: { poId: po.id, poNumber: po.poNumber }, actor: procurer });
      trace(s, { type: 'DISPATCHED', occurredAt: iso(when), lotId: lot.id, lotCode: lot.code, commodityId: l.c.id, quantity: l.qty, unit: l.c.unit, quantityKind: 'DISPATCHED', from: supplierParty(sup), to: facRef(stateWh), refs: { poId: po.id, poNumber: po.poNumber, shipmentId, shipmentNo }, actor: procurer, note: `Invoice INV-${rng.int(10000, 99999)}` });
      return lot;
    });
    const v = rng.pick(s.vehicles);
    s.asns.push({ id: shipmentId, asnNo: shipmentNo, poId: po.id, invoiceNo: `INV-${rng.int(10000, 99999)}`, vehicleNo: v.registrationNo, dispatchedAt: iso(when), expectedArrivalAt: iso(eta), lots: lots.map((l) => ({ lotId: l.id, lotCode: l.code, commodityName: l.commodity.name, unit: l.commodity.unit, quantity: l.quantity, supplierLotNo: l.supplierLotNo, expiresOn: l.expiresOn })) });
    const sh: ShipmentDto & { geoPaths: string[] } = {
      id: shipmentId, tenantId: code, shipmentNo, origin: 'SUPPLIER', from: supplierParty(sup), to: facRef(stateWh), poId: po.id, poNumber: po.poNumber, purpose: 'REPLENISHMENT', status: 'DISPATCHED',
      lines: lots.map((l) => ({ lotId: l.id, lotCode: l.code, commodityId: l.commodity.id, commodityName: l.commodity.name, unit: l.commodity.unit, dispatchedQty: l.quantity })),
      vehicle: { registrationNo: v.registrationNo, driverName: v.driver.name, driverPhone: v.driver.phone, transporterName: v.transporterName }, plannedDispatchAt: iso(when), dispatchedAt: iso(when),
      expectedArrivalAt: iso(eta), delayHours: 0, hasDiscrepancy: false, milestones: [{ status: 'DISPATCHED', at: iso(when), note: 'Supplier dispatch (ASN)', actor: procurer }], totalQtyByUnit: {}, createdAt: iso(when), geoPaths: [stateWh.geoPath],
    };
    s.shipments.push(sh);
    return { lots, shipment: sh };
  };

  /** Goods receipt with separate received / accepted / rejected quantities. */
  const receive = (sh: ShipmentDto & { geoPaths: string[] }, when: Date, adjust: Record<string, { received?: number; rejected?: number; reason?: 'DAMAGED' | 'SHORT_SUPPLIED' }> = {}) => {
    const to = s.facilityById.get(sh.to.id)!;
    const grnNo = nextNo(s, 'GRN', when);
    const grnId = newId(s);
    const by = fieldActor(to);
    const lines = sh.lines.map((l) => {
      const a = adjust[l.lotId] ?? {};
      const received = a.received ?? l.dispatchedQty;
      const rejected = a.rejected ?? 0;
      const accepted = round(received - rejected);
      if (accepted > 0) moveStock(s, { facilityId: to.id, lotId: l.lotId, type: 'RECEIPT', onHandDelta: accepted, ref: { kind: 'GRN', id: grnId, label: grnNo }, at: iso(when), actor: by });
      Object.assign(l, { receivedQty: received, acceptedQty: accepted, rejectedQty: rejected });
      const base = { occurredAt: iso(when), lotId: l.lotId, lotCode: l.lotCode, commodityId: l.commodityId, unit: l.unit, from: sh.from, to: facRef(to), refs: { shipmentId: sh.id, shipmentNo: sh.shipmentNo, grnId, poId: sh.poId, poNumber: sh.poNumber }, actor: by, geo: to.location };
      trace(s, { ...base, type: 'RECEIVED', quantity: received, quantityKind: 'RECEIVED', note: `${grnNo}; expected ${l.dispatchedQty}` });
      trace(s, { ...base, type: 'RECEIVED', quantity: accepted, quantityKind: 'ACCEPTED' });
      if (rejected > 0) trace(s, { ...base, type: 'RECEIVED', quantity: rejected, quantityKind: 'REJECTED', note: a.reason });
      if (sh.poId) {
        const po = s.pos.find((p) => p.id === sh.poId)!;
        const pl = po.lines.find((x) => x.commodityId === l.commodityId)!;
        pl.received = round(pl.received + received); pl.accepted = round(pl.accepted + accepted); pl.rejected = round(pl.rejected + rejected);
        po.status = po.lines.every((x) => x.accepted >= x.quantity * 0.995) ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
      }
      return { lotId: l.lotId, lotCode: l.lotCode, commodityId: l.commodityId, commodityName: l.commodityName, unit: l.unit, expectedQty: l.dispatchedQty, receivedQty: received, acceptedQty: accepted, rejectedQty: rejected, rejectionReason: a.reason };
    });
    const hasDiscrepancy = lines.some((l) => l.receivedQty < l.expectedQty || l.rejectedQty > 0);
    s.grns.push({ id: grnId, grnNo, facility: facRef(to), shipmentId: sh.id, shipmentNo: sh.shipmentNo, receivedAt: iso(when), sealIntact: true, hasDiscrepancy, lines, receivedBy: by });
    sh.status = hasDiscrepancy ? 'PARTIALLY_RECEIVED' : 'RECEIVED';
    sh.receivedAt = iso(when);
    sh.arrivedAt = iso(addDays(when, -0.02));
    sh.grnId = grnId;
    sh.hasDiscrepancy = hasDiscrepancy;
    sh.milestones.push({ status: 'ARRIVED', at: iso(addDays(when, -0.02)), actor: by }, { status: sh.status, at: iso(when), note: hasDiscrepancy ? 'Received with discrepancy' : 'Received in full', actor: by });
    if (hasDiscrepancy) {
      for (const l of lines) {
        const c = rules.receiptVariance(l.expectedQty, l.receivedQty, config, `${l.lotCode} (${sh.shipmentNo})`, l.unit);
        if (c) raise(s, `MISMATCH:${sh.id}:${l.lotCode}`, c, { geoPath: to.geoPath, facility: facRef(to), entity: { kind: 'SHIPMENT', id: sh.id, label: sh.shipmentNo }, link: `/logistics/shipments/${sh.id}` }, when);
      }
    }
    return grnId;
  };

  const inspect = (lot: LotDto, f: FacilityDto, when: Date, result: 'PASS' | 'FAIL' = 'PASS', params?: { name: string; value: string; unit?: string; limit?: string; passed: boolean }[], type: 'RECEIPT' | 'LAB_TEST' = 'RECEIPT', remarks?: string) => {
    const insId = newId(s);
    const parameters = params ?? (lot.commodity.category === 'EGG'
      ? [{ name: 'Shell integrity', value: `${rng.int(97, 100)}`, unit: '%', limit: '≥ 97', passed: true }, { name: 'Float test', value: 'Pass', passed: true }]
      : lot.commodity.category === 'VEGETABLE' ? [{ name: 'Freshness (visual)', value: 'Good', passed: true }]
      : [{ name: 'Moisture', value: rng.float(10.5, 13.2).toFixed(1), unit: '%', limit: '≤ 14', passed: true }, { name: 'Foreign matter', value: rng.float(0.1, 0.6).toFixed(1), unit: '%', limit: '≤ 1', passed: true }, { name: 'Insect damage', value: rng.float(0.2, 1.4).toFixed(1), unit: '%', limit: '≤ 2', passed: true }]);
    const decided = result === 'PASS';
    s.inspections.push({
      id: insId, inspectionNo: nextNo(s, 'INS', when), type, facility: facRef(f), lot: { id: lot.id, code: lot.code, commodityId: lot.commodity.id, commodityName: lot.commodity.name, unit: lot.commodity.unit, expiresOn: lot.expiresOn, status: lot.status },
      sampledAt: iso(when), labRef: type === 'LAB_TEST' ? `FSL-${code}-${rng.int(1000, 9999)}` : undefined, parameters, result, remarks, inspector, createdAt: iso(when),
      decision: decided ? { decision: 'RELEASE', reason: 'All parameters within specification', by: inspector, at: iso(addDays(when, 0.02)) } : undefined,
    });
    trace(s, { type: 'INSPECTED', occurredAt: iso(when), lotId: lot.id, lotCode: lot.code, quantity: 0, quantityKind: 'NONE', facility: facRef(f), refs: { inspectionId: insId }, actor: inspector, note: `${type}: ${result}` });
    const status = decided ? 'RELEASED' : 'ON_HOLD';
    if (lot.status !== status) {
      lot.status = status;
      trace(s, { type: 'STATUS_CHANGED', occurredAt: iso(addDays(when, 0.02)), lotId: lot.id, lotCode: lot.code, quantity: 0, quantityKind: 'NONE', facility: facRef(f), refs: { inspectionId: insId }, actor: inspector, note: decided ? 'RELEASED: all parameters within specification' : `ON_HOLD: automatic hold — ${parameters.filter((p) => !p.passed).map((p) => p.name).join(', ')} failed` });
    }
    if (!decided) raise(s, `QC:${insId}`, { type: 'QUALITY_FAILURE', severity: 'HIGH', title: `${lot.code} failed ${type === 'LAB_TEST' ? 'laboratory' : 'receipt'} inspection`, detail: parameters.filter((x) => !x.passed).map((x) => `${x.name}: ${x.value}${x.unit ?? ''} (limit ${x.limit ?? '—'})`).join('; '), slaHours: 48 }, { geoPath: f.geoPath, facility: facRef(f), entity: { kind: 'LOT', id: lot.id, label: lot.code }, link: `/trace/lots/${lot.id}` }, when);
    return insId;
  };

  /** Facility-to-facility transfer, FEFO-picked, dispatched and (optionally) received. */
  const transfer = (from: FacilityDto, to: FacilityDto, need: Map<string, number>, dispatchAt: Date, receiveAt: Date | null, adjust?: (lines: ShipmentDto['lines']) => Record<string, { received?: number; rejected?: number; reason?: 'DAMAGED' | 'SHORT_SUPPLIED' }>) => {
    const day = localDate(dispatchAt);
    const lines: ShipmentDto['lines'] = [];
    for (const [cid, q] of need) {
      const c = s.commodities.find((x) => x.id === cid)!;
      const qty = roundQty(c, q);
      const rows = s.lots.filter((l) => l.commodity.id === cid).map((l) => ({ lotId: l.id, lotCode: l.code, expiresOn: l.expiresOn, available: available(cell(s, from.id, l.id)), status: l.status, receivedAt: cell(s, from.id, l.id)?.receivedAt }));
      for (const p of allocateFefo(rows, qty, day).picks) lines.push({ lotId: p.lotId, lotCode: p.lotCode, commodityId: cid, commodityName: c.name, unit: c.unit as Unit, dispatchedQty: p.quantity });
    }
    if (!lines.length) return undefined;
    const id = newId(s);
    const shipmentNo = nextNo(s, 'SHP', dispatchAt);
    const v = rng.pick(s.vehicles);
    const by = fieldActor(from);
    for (const l of lines) {
      moveStock(s, { facilityId: from.id, lotId: l.lotId, type: 'DISPATCH', onHandDelta: -l.dispatchedQty, ref: { kind: 'SHIPMENT', id, label: shipmentNo }, at: iso(dispatchAt), actor: by, requireReleased: true });
      trace(s, { type: 'DISPATCHED', occurredAt: iso(dispatchAt), lotId: l.lotId, lotCode: l.lotCode, commodityId: l.commodityId, quantity: l.dispatchedQty, unit: l.unit, quantityKind: 'DISPATCHED', from: facRef(from), to: facRef(to), refs: { shipmentId: id, shipmentNo }, actor: by, note: `Vehicle ${v.registrationNo}` });
    }
    const eta = new Date(dispatchAt.getTime() + (to.type === 'SCHOOL' ? 5 : 9) * 3_600_000);
    const sh: ShipmentDto & { geoPaths: string[] } = {
      id, tenantId: code, shipmentNo, origin: 'FACILITY', from: facRef(from), to: facRef(to), purpose: 'REPLENISHMENT', status: 'DISPATCHED', lines,
      vehicle: { registrationNo: v.registrationNo, driverName: v.driver.name, driverPhone: v.driver.phone, transporterName: v.transporterName }, plannedDispatchAt: iso(addDays(dispatchAt, -1)), dispatchedAt: iso(dispatchAt),
      expectedArrivalAt: iso(eta), delayHours: 0, hasDiscrepancy: false, milestones: [{ status: 'PLANNED', at: iso(addDays(dispatchAt, -1)), actor: by }, { status: 'DISPATCHED', at: iso(dispatchAt), actor: by }],
      totalQtyByUnit: {}, createdAt: iso(addDays(dispatchAt, -1)), geoPaths: [from.geoPath, to.geoPath],
      lastLocation: { lat: to.location!.lat, lng: to.location!.lng, at: iso(eta), source: 'GPS' },
    };
    s.shipments.push(sh);
    if (receiveAt) receive(sh, receiveAt, adjust?.(lines));
    return sh;
  };

  /* ── Dry goods: procured once, ahead of the cycle ── */
  const start = -(spec.days - 1);
  const dryCodes = ['RICE', 'TOOR', 'MOONG', 'CHANA', 'RAVA', 'RAGI', 'OIL', 'SALT'];
  const dryLots = new Map<string, LotDto[]>();
  const t0 = at(start - 5, 9);
  const bySupplier = new Map<string, { c: CommodityDto; qty: number }[]>();
  for (const cc of dryCodes) {
    const c = com(cc);
    const q = roundQty(c, (totalNeed.get(c.id) ?? 0) * 1.6);
    if (!q) continue;
    const sup = supplierFor(cc);
    bySupplier.set(sup.id, [...(bySupplier.get(sup.id) ?? []), { c, qty: q + (spec.scenarios && cc === 'TOOR' ? 2500 : 0) }]);
  }
  for (const [supId, lines] of bySupplier) {
    const po = poFor(s.suppliers.find((x) => x.id === supId)!, lines, addDays(t0, -2));
    pos.set(supId, po);
    const specsL: { c: CommodityDto; qty: number; packed: Date; expires: Date; cert?: boolean }[] = [];
    for (const { c, qty } of lines) {
      const shelf = c.shelfLifeDays;
      if (spec.scenarios && c.code === 'RICE') {
        const rest = qty - 10_000;
        specsL.push({ c, qty: 10_000, packed: addDays(t0, -30), expires: addDays(t0, shelf - 60) }, { c, qty: roundQty(c, rest / 2), packed: addDays(t0, -20), expires: addDays(t0, shelf - 30) }, { c, qty: roundQty(c, rest / 2), packed: addDays(t0, -10), expires: addDays(t0, shelf) });
      } else if (spec.scenarios && c.code === 'MOONG') {
        specsL.push({ c, qty: roundQty(c, qty * 0.45), packed: addDays(t0, -40), expires: addDays(t0, 120) }, { c, qty: roundQty(c, qty * 0.55), packed: addDays(t0, -12), expires: addDays(t0, shelf) });
      } else if (spec.scenarios && c.code === 'TOOR') {
        specsL.push({ c, qty: qty - 2500, packed: addDays(t0, -15), expires: addDays(t0, shelf) }, { c, qty: 2500, packed: addDays(t0, -18), expires: addDays(t0, shelf - 10) });
      } else if (spec.scenarios && c.code === 'RAVA') {
        specsL.push({ c, qty: roundQty(c, qty * 1.3), packed: addDays(t0, -60), expires: addDays(midnight, 24) });
      } else {
        specsL.push({ c, qty, packed: addDays(t0, -14), expires: addDays(t0, shelf), cert: !(c.code === 'SALT') });
      }
    }
    const { lots, shipment } = dispatchFromSupplier(po, specsL, t0, addDays(t0, 1));
    for (const l of lots) dryLots.set(l.commodity.code!, [...(dryLots.get(l.commodity.code!) ?? []), l]);
    const rice1 = lots.find((l) => l.commodity.code === 'RICE' && l.quantity === 10_000);
    receive(shipment, at(start - 4, 11, 30), rice1 && spec.scenarios ? { [rice1.id]: { received: 9_980 } } : {});
    for (const l of lots) {
      const toorHold = spec.scenarios && l.commodity.code === 'TOOR' && l.quantity === 2500;
      inspect(l, stateWh, at(start - 4, 15), toorHold ? 'FAIL' : 'PASS', toorHold ? [
        { name: 'Moisture', value: '15.8', unit: '%', limit: '≤ 10', passed: false }, { name: 'Foreign matter', value: '0.4', unit: '%', limit: '≤ 1', passed: true }, { name: 'Weevilled grains', value: '3.1', unit: '%', limit: '≤ 2', passed: false },
      ] : undefined, 'RECEIPT', toorHold ? 'Bags damp at the bottom layer; sample drawn from 12 bags.' : undefined);
    }
  }
  audit(s, whOp, 'inventory.grn_posted', { kind: 'GRN', id: s.grns[0]!.id, label: s.grns[0]!.grnNo }, undefined, at(start - 4, 11, 30));

  /* ── Weekly cycle + daily kitchens ── */
  const nutritionRefs = new Map<string, NutritionRef>(s.commodities.map((c) => [c.id, { commodityId: c.id, gramsPerUnit: c.gramsPerUnit, nutritionPer100: c.nutritionPer100 }]));
  const districtsOf = (sc: FacilityDto) => [...districtWh.values()].find((d) => sc.geoPath.startsWith(`${d.geoPath}/`))!;
  const shortSchools = new Set(spec.scenarios ? [schools[5]!.id, schools[23]!.id, schools[41]!.id] : []);
  const rejectEggSchool = spec.scenarios ? schools[30]!.id : '';
  let recalledLot: LotDto | undefined;
  const scenarioSchools = { shortfall: schools[11]!, wastage: schools[37]!, interrupted: schools[50] ?? schools[2]!, pendingBreakfast: schools.find((x, i) => i > 60 && x.school!.category === 'PRIMARY') ?? schools[1]! };

  for (let day = start - 3; day <= 0; day++) {
    // Weekly logistics, anchored on week starts
    weeks.forEach((wdays, wi) => {
      const ws = wdays[0]!;
      if (day === ws - 3) {
        // fresh produce: weekly procurement
        const fresh = ['VEG', 'EGG'].map((cc) => {
          const c = com(cc);
          const q = [...schoolWeekNeed[wi]!.values()].reduce((a, m) => a + (m.get(c.id) ?? 0), 0);
          return { c, qty: roundQty(c, q * (wi === 0 ? 1.5 : 1.18)) };
        }).filter((x) => x.qty > 0);
        for (const f of fresh) {
          const sup = supplierFor(f.c.code);
          const po = poFor(sup, [f], at(day - 1, 16));
          const { lots, shipment } = dispatchFromSupplier(po, [{ c: f.c, qty: f.qty, packed: at(day, 5), expires: addDays(at(day, 5), f.c.code === 'VEG' ? 10 : 18) }], at(day, 6), at(day, 12));
          receive(shipment, at(day, 11, 15));
          for (const l of lots) inspect(l, stateWh, at(day, 12));
        }
      }
      if (day === ws - 2) {
        for (const [dcode, dwh] of districtWh) {
          const need = new Map<string, number>();
          for (const sc of schools.filter((x) => districtsOf(x).id === dwh.id)) for (const [c, q] of schoolWeekNeed[wi]!.get(sc.id)!) need.set(c, (need.get(c) ?? 0) + q * (wi === 0 ? 1.45 : 1.12));
          transfer(stateWh, dwh, need, at(day, 6, 30), at(day, 15, 45));
          void dcode;
        }
      }
      if (day === ws - 1) {
        for (const sc of schools) {
          const dwh = districtsOf(sc);
          const need = new Map([...schoolWeekNeed[wi]!.get(sc.id)!].map(([c, q]) => [c, q * 1.06]));
          transfer(dwh, sc, need, at(day, 7, rng.int(0, 50)), at(day, 12, rng.int(0, 59)), (lines) => {
            const adj: Record<string, { received?: number; rejected?: number; reason?: 'DAMAGED' | 'SHORT_SUPPLIED' }> = {};
            if (shortSchools.has(sc.id) && wi === weeks.length - 1) {
              const rice = lines.find((l) => l.commodityId === 'c-RICE');
              if (rice) adj[rice.lotId] = { received: round(rice.dispatchedQty - rng.int(6, 14)) };
            }
            if (sc.id === rejectEggSchool && wi === weeks.length - 1) {
              const egg = lines.find((l) => l.commodityId === 'c-EGG');
              if (egg) adj[egg.lotId] = { rejected: 30, reason: 'DAMAGED' };
            }
            return adj;
          });
        }
      }
    });

    // Recall scenario: lab test fails two days ago; recall issued the next morning
    if (spec.scenarios && day === -3) {
      const moong = dryLots.get('MOONG')!.find((l) => l.expiresOn === [...dryLots.get('MOONG')!].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))[0]!.expiresOn)!;
      const sampleSchool = schools.find((sc) => (cell(s, sc.id, moong.id)?.onHand ?? 0) > 0) ?? schools[0]!;
      inspect(moong, sampleSchool, at(day, 13), 'FAIL', [
        { name: 'Aflatoxin B1', value: '38', unit: 'µg/kg', limit: '≤ 15', passed: false }, { name: 'Moisture', value: '9.1', unit: '%', limit: '≤ 10', passed: true },
      ], 'LAB_TEST', `Complaint-led sample from ${sampleSchool.name}; analysed at state Food Safety Laboratory.`);
      recalledLot = moong;
    }
    if (spec.scenarios && day === -2 && recalledLot) {
      const when = at(day, 9, 30);
      recalledLot.status = 'RECALLED';
      const recallId = newId(s);
      trace(s, { type: 'STATUS_CHANGED', occurredAt: iso(when), lotId: recalledLot.id, lotCode: recalledLot.code, quantity: 0, quantityKind: 'NONE', refs: { recallId }, actor: inspector, note: 'RECALLED: aflatoxin above limit' });
      trace(s, { type: 'RECALL_INITIATED', occurredAt: iso(when), lotId: recalledLot.id, lotCode: recalledLot.code, quantity: 0, quantityKind: 'NONE', refs: { recallId }, actor: inspector, note: 'Aflatoxin B1 above the FSSAI limit in laboratory sample' });
      s.recalls.push({
        id: recallId, recallNo: nextNo(s, 'RCL', when), lots: [{ id: recalledLot.id, code: recalledLot.code, commodityId: recalledLot.commodity.id, commodityName: recalledLot.commodity.name, unit: recalledLot.commodity.unit, expiresOn: recalledLot.expiresOn, status: 'RECALLED' }],
        reason: `Laboratory report found aflatoxin B1 at 38 µg/kg against a limit of 15 µg/kg in ${recalledLot.code}.`, instruction: 'Stop using this lot immediately. Move remaining bags to a marked quarantine area, do not return to the supplier until collected by the district team, and acknowledge in NutriTrace.',
        severity: 'CRITICAL', status: 'IN_PROGRESS', initiatedBy: inspector, initiatedAt: iso(when), affected: [],
      });
      audit(s, inspector, 'quality.recall_initiated', { kind: 'RECALL', id: recallId, label: s.recalls[0]!.recallNo }, undefined, when);
    }

    // After the recall, the persona school gets an emergency top-up from the state warehouse.
    if (spec.scenarios && day === 0) {
      const need = new Map([...needFor(personaSchool, [0, 0])].map(([c, q]) => [c, q * 1.3]));
      transfer(stateWh, personaSchool, need, at(-1, 10), at(-1, 17));
    }
    // Kitchens and meal service
    if (!opDays.includes(day)) continue;
    const dow = at(day).getDay();
    for (const sc of schools) {
      const present = attendance.get(`${sc.id}|${day}`)!;
      for (const mt of mealTypesOf(sc)) {
        const isToday = day === 0;
        if (isToday && mt === 'LUNCH' && rng.chance(0.18)) continue; // not yet reported today
        if (isToday && mt === 'BREAKFAST' && sc.id === scenarioSchools.pendingBreakfast.id) continue;
        if (isToday && mt === 'LUNCH' && spec.scenarios && sc.id === personaSchool.id) continue; // left for the live demo
        const recipe = recipeFor(dow, mt);
        const t = mt === 'BREAKFAST' ? at(day, 7, 40) : at(day, 11, 50);
        const interrupted = spec.scenarios && ((day === -1 && sc.id === scenarioSchools.shortfall.id && mt === 'LUNCH') || (isToday && sc.id === scenarioSchools.interrupted.id && mt === 'BREAKFAST'));
        const prepared = interrupted ? Math.round(present * 0.32) : Math.round(present * rng.float(1.0, 1.05));
        const prodId = cook(sc, day, mt, recipe, present, prepared, t);
        const wasteDay = spec.scenarios && day === -2 && sc.id === scenarioSchools.wastage.id && mt === 'LUNCH';
        const served = interrupted ? prepared : wasteDay ? Math.round(present * 0.78) : Math.min(prepared, present - (rng.chance(0.08) ? rng.int(1, 3) : 0));
        const leftover = wasteDay ? prepared - served : Math.max(0, prepared - served - (rng.chance(0.3) ? 1 : 0));
        serve(sc, day, mt, prodId, present, prepared, served, leftover, interrupted ? (mt === 'BREAKFAST' ? 'Cook absent; dry ration (biscuits and banana) given instead' : 'LPG cylinder ran out mid-cooking; partial meal served') : undefined, mt === 'BREAKFAST' ? at(day, 9, 5) : at(day, 13, 30 + rng.int(0, 70)));
      }
    }
  }

  function cook(sc: FacilityDto, day: number, mt: MealType, recipe: RecipeRow, planned: number, prepared: number, t: Date) {
    const cat = sc.school!.category as SchoolCategory;
    const id = newId(s);
    const batchNo = nextNo(s, 'MPB', t);
    const consumption: { lotId: string; lotCode: string; commodityId: string; commodityName: string; unit: Unit; quantity: number; plannedQuantity: number }[] = [];
    const by = fieldActor(sc);
    for (const ing of recipe.ingredients) {
      const c = s.commodities.find((x) => x.id === ing.commodityId)!;
      const need = round(ing.perServing[cat] * prepared * (c.unit === 'PIECE' ? 1 : rng.float(0.97, 1.03)));
      const rows = s.lots.filter((l) => l.commodity.id === c.id).map((l) => ({ lotId: l.id, lotCode: l.code, expiresOn: l.expiresOn, available: available(cell(s, sc.id, l.id)), status: l.status }));
      for (const p of allocateFefo(rows, need, localDate(at(day))).picks) {
        moveStock(s, { facilityId: sc.id, lotId: p.lotId, type: 'ISSUE', onHandDelta: -p.quantity, ref: { kind: 'PRODUCTION', id, label: batchNo }, at: iso(t), actor: by });
        consumption.push({ lotId: p.lotId, lotCode: p.lotCode, commodityId: c.id, commodityName: c.name, unit: c.unit, quantity: p.quantity, plannedQuantity: round(ing.perServing[cat] * planned) });
        trace(s, { type: 'CONSUMED', occurredAt: iso(t), lotId: p.lotId, lotCode: p.lotCode, commodityId: c.id, quantity: p.quantity, unit: c.unit, quantityKind: 'CONSUMED', facility: facRef(sc), refs: { productionId: id, batchNo }, actor: by });
      }
    }
    trace(s, { type: 'MEAL_PRODUCED', occurredAt: iso(t), quantity: prepared, quantityKind: 'NONE', facility: facRef(sc), refs: { productionId: id, batchNo }, meals: { count: prepared, mealType: mt }, actor: by });
    s.productions.push({
      id, batchNo, facility: facRef(sc), date: localDate(at(day)), mealType: mt, recipe: { id: recipe.id, name: recipe.name, code: recipe.code }, plannedServings: planned, preparedServings: prepared,
      startedAt: iso(new Date(t.getTime() - 100 * 60_000)), completedAt: iso(t), consumption, tasteTested: true,
      estimatePerServing: estimateServing(consumption.map((c) => ({ commodityId: c.commodityId, quantity: prepared ? c.quantity / prepared : 0 })), nutritionRefs),
      servedToSchoolIds: [sc.id], recordedBy: by, createdAt: iso(t),
    });
    return id;
  }

  function serve(sc: FacilityDto, day: number, mt: MealType, productionId: string, present: number, available_: number, served: number, leftover: number, interruption: string | undefined, t: Date) {
    const prod = s.productions.find((p) => p.id === productionId)!;
    const id = newId(s);
    const by = fieldActor(sc);
    const cutoff = at(day, config.thresholds.schoolReportCutoffHour);
    const svc = {
      id, school: facRef(sc), districtName: sc.districtName, blockName: sc.blockName, date: localDate(at(day)), mealType: mt, productionBatchId: productionId, batchNo: prod.batchNo,
      enrolled: sc.school!.enrolment, present, mealsAvailable: available_, mealsServed: served, leftoverServings: leftover, wastageKg: round(leftover * 0.22, 1),
      wastageReason: leftover > 0 ? (leftover > available_ * 0.1 ? 'LOW_ATTENDANCE' : 'LEFTOVER_POT') : undefined, serviceInterrupted: !!interruption, interruptionReason: interruption,
      coveragePct: present ? round((served / present) * 100, 1) : 0, reportedAt: iso(t), reportedBy: by, late: t > cutoff,
    } as const;
    s.services.push({ ...svc });
    if (served > 0) trace(s, { type: 'MEAL_SERVED', occurredAt: iso(mt === 'BREAKFAST' ? at(day, 8, 30) : at(day, 12, 45)), quantity: served, quantityKind: 'SERVED', facility: facRef(sc), refs: { productionId, batchNo: prod.batchNo, mealServiceId: id }, meals: { count: served, mealType: mt, schoolId: sc.id }, actor: by });
    if (day >= -6) {
      const ctx = { geoPath: sc.geoPath, facility: facRef(sc), entity: { kind: 'SCHOOL' as const, id: sc.id, label: sc.name }, link: `/schools/${sc.id}` };
      if (present > 0 && served < present * 0.95) {
        raise(s, `SHORT:${id}`, { type: 'MEAL_SHORTFALL', severity: served < present * 0.8 ? 'CRITICAL' : 'HIGH', title: `${present - served} children present were not served ${mt.toLowerCase()} at ${sc.name}`, detail: `${svc.date}: present ${present}, served ${served}${interruption ? `. ${interruption}` : ''}.`, slaHours: 24 }, ctx, t);
      }
      const w = rules.wastage(available_ ? round((leftover / available_) * 100, 1) : 0, config, `${sc.name} (${svc.date})`);
      if (w) raise(s, `WASTE:${id}`, w, ctx, t);
    }
  }

  /* ── Recall impact and acknowledgements (computed from the ledger) ── */
  if (recalledLot) {
    const r = s.recalls[0]!;
    const evs = s.pending.filter((e) => e.lotId === recalledLot!.id && e.occurredAt <= r.initiatedAt);
    const rows = new Map<string, (typeof r.affected)[number]>();
    for (const e of evs) {
      if (e.type === 'RECEIVED' && e.quantityKind === 'ACCEPTED' && e.to) {
        const f = s.facilityById.get(e.to.id)!;
        const row = rows.get(f.id) ?? { facility: facRef(f), districtName: f.districtName, receivedQty: 0, consumedQty: 0, onHandQty: 0, mealsServedWithLot: 0, acknowledged: false };
        row.receivedQty = round(row.receivedQty + e.quantity);
        rows.set(f.id, row);
      }
      if (e.type === 'CONSUMED' && e.facility) {
        const row = rows.get(e.facility.id);
        if (row) row.consumedQty = round(row.consumedQty + e.quantity);
      }
    }
    for (const row of rows.values()) {
      row.onHandQty = round(cell(s, row.facility.id, recalledLot.id)?.onHand ?? 0);
      const prodIds = new Set(s.pending.filter((e) => e.type === 'CONSUMED' && e.lotId === recalledLot!.id && e.facility?.id === row.facility.id).map((e) => e.refs.productionId));
      row.mealsServedWithLot = s.services.filter((x) => x.productionBatchId && prodIds.has(x.productionBatchId)).reduce((a, x) => a + x.mealsServed, 0);
    }
    r.affected = [...rows.values()];
    r.affected.forEach((row, i) => {
      if (i % 7 < 6 || row.facility.type !== 'SCHOOL') {
        const f = s.facilityById.get(row.facility.id)!;
        const when = at(-2, 11 + (i % 6), (i * 7) % 60);
        Object.assign(row, { acknowledged: true, acknowledgedAt: iso(when), acknowledgedBy: fieldActor(f), quarantinedQty: row.onHandQty });
        trace(s, { type: 'RECALL_ACKNOWLEDGED', occurredAt: iso(when), lotId: recalledLot!.id, lotCode: recalledLot!.code, quantity: row.onHandQty, quantityKind: 'NONE', facility: facRef(f), refs: { recallId: r.id }, actor: fieldActor(f) });
      } else if (row.onHandQty > 0 || row.facility.type === 'SCHOOL') {
        raise(s, `RECALL:${r.id}:${row.facility.id}`, { type: 'RECALL_PENDING_ACK', severity: 'CRITICAL', title: `${row.facility.name} has not acknowledged recall ${r.recallNo}`, detail: `${row.onHandQty} kg still on hand. ${r.instruction}`, slaHours: 12 }, { geoPath: row.facility.geoPath, facility: row.facility, entity: { kind: 'RECALL', id: r.id, label: r.recallNo }, link: `/quality/recalls/${r.id}` }, at(-2, 10));
      }
    });
    s.capas.push(
      { id: newId(s), capaNo: nextNo(s, 'CAPA'), title: `Root cause of aflatoxin in ${recalledLot.code}`, description: 'Audit supplier drying and storage; review moisture records for all moong lots from this supplier.', source: 'RECALL', sourceRef: r.id, facility: facRef(stateWh), ownerName: inspector.name, dueDate: localDate(addDays(midnight, 5)), severity: 'CRITICAL', status: 'IN_PROGRESS', log: [{ status: 'OPEN', note: 'Raised with recall', at: r.initiatedAt, by: inspector }, { status: 'IN_PROGRESS', note: 'Supplier visit scheduled', at: iso(at(-1, 11)), by: inspector }], createdAt: r.initiatedAt },
    );
  }

  /* ── Live demo set pieces for today ── */
  if (spec.scenarios) {
    // 1) Shipment on the road to the headmaster persona's school (receive it live)
    const pdwh = districtsOf(personaSchool);
    const inbound = transfer(pdwh, personaSchool, new Map([['c-EGG', 120], ['c-RICE', 60]]), at(0, 7, 45), null)!;
    inbound.status = 'IN_TRANSIT';
    inbound.expectedArrivalAt = iso(at(0, 13, 30));
    inbound.milestones.push({ status: 'IN_TRANSIT', at: iso(at(0, 8, 5)), note: 'GPS fix received', actor: fieldActor(pdwh) });
    inbound.route = Array.from({ length: 12 }, (_, i) => ({ lat: pdwh.location!.lat + ((personaSchool.location!.lat - pdwh.location!.lat) * i) / 14, lng: pdwh.location!.lng + ((personaSchool.location!.lng - pdwh.location!.lng) * i) / 14, at: iso(at(0, 8, i * 9)) }));
    inbound.lastLocation = { ...inbound.route[inbound.route.length - 1]!, source: 'GPS' };
    // 1b) Last mile: today's trip from the Madurai store — first school delivered, the headmaster's school next.
    const mduSchools = schools.filter((sc) => districtsOf(sc).id === pdwh.id && sc.id !== personaSchool.id);
    const [schA, schB, schC, schD] = mduSchools;
    const shA = transfer(pdwh, schA!, new Map([['c-EGG', 150], ['c-RICE', 40]]), at(0, 7, 40), null)!;
    const shB = transfer(pdwh, schB!, new Map([['c-EGG', 120]]), at(0, 7, 40), null)!;
    const tripId = newId(s);
    const tripNo = nextNo(s, 'TRP', at(0, 7));
    const driver = s.users.find((u) => u.persona === 'tn-driver');
    const vehicle = s.vehicles[2]!;
    const tripShips = [shA, inbound, shB];
    for (const sh of tripShips) { sh.status = 'IN_TRANSIT'; sh.tripId = tripId; sh.tripNo = tripNo; sh.vehicle = { registrationNo: vehicle.registrationNo, driverName: driver?.name ?? vehicle.driver.name, driverPhone: vehicle.driver.phone }; }
    const grnA = receive(shA, at(0, 9, 5));
    const stops = tripShips.map((sh, i) => ({ seq: i + 1, shipmentId: sh.id, shipmentNo: sh.shipmentNo, facility: sh.to, status: 'PENDING' as const, lineSummary: sh.lines.map((l) => `${l.commodityName.split(' ')[0]} ${round(l.dispatchedQty)} ${l.unit === 'PIECE' ? 'pcs' : 'kg'}`).join(', ') }));
    s.trips.push({
      id: tripId, tripNo, origin: facRef(pdwh), vehicleNo: vehicle.registrationNo, driverName: driver?.name ?? vehicle.driver.name, driverPhone: vehicle.driver.phone, status: 'IN_PROGRESS', plannedStartAt: iso(at(0, 7, 30)), startedAt: iso(at(0, 7, 40)),
      stops: stops.map((st, i) => (i === 0 ? { ...st, status: 'DELIVERED', arrivedAt: iso(at(0, 8, 58)), deliveredAt: iso(at(0, 9, 2)), pod: { receivedBy: schA!.inCharge?.name ?? 'Headmaster', receiverRole: 'Headmaster', signedAt: iso(at(0, 9, 2)), geo: schA!.location, grnId: grnA, grnNo: s.grns.find((g) => g.id === grnA)?.grnNo } } : st)),
      progress: { total: 3, delivered: 1, failed: 0 }, createdBy: whOp, createdAt: iso(at(-1, 16)),
    });
    // School deliveries planned but not yet on a trip (stock reserved at the store).
    for (const [sc, need] of [[schC!, new Map([['c-EGG', 90], ['c-RICE', 30]])], [schD!, new Map([['c-EGG', 110]])]] as const) {
      const id = newId(s);
      const shipmentNo = nextNo(s, 'SHP', at(0, 8));
      const lines: ShipmentDto['lines'] = [];
      for (const [cid, q] of need) {
        const c = s.commodities.find((x) => x.id === cid)!;
        const rows = s.lots.filter((l) => l.commodity.id === cid).map((l) => ({ lotId: l.id, lotCode: l.code, expiresOn: l.expiresOn, available: available(cell(s, pdwh.id, l.id)), status: l.status }));
        for (const p of allocateFefo(rows, q, localDate(midnight)).picks) {
          moveStock(s, { facilityId: pdwh.id, lotId: p.lotId, type: 'RESERVATION', onHandDelta: 0, reservedDelta: p.quantity, ref: { kind: 'SHIPMENT', id, label: shipmentNo }, at: iso(at(0, 8)), actor: whOp });
          lines.push({ lotId: p.lotId, lotCode: p.lotCode, commodityId: cid, commodityName: c.name, unit: c.unit, dispatchedQty: p.quantity });
        }
      }
      s.reservations.set(id, { facilityId: pdwh.id, lines: lines.map((l) => ({ lotId: l.lotId, quantity: l.dispatchedQty })), status: 'ACTIVE' });
      s.shipments.push({ id, tenantId: code, shipmentNo, origin: 'FACILITY', from: facRef(pdwh), to: facRef(sc), purpose: 'REPLENISHMENT', status: 'PLANNED', lines, plannedDispatchAt: iso(at(0, 11)), expectedArrivalAt: iso(at(0, 15)), delayHours: 0, hasDiscrepancy: false, milestones: [{ status: 'PLANNED', at: iso(at(0, 8)), actor: whOp }], totalQtyByUnit: {}, createdAt: iso(at(0, 8)), geoPaths: [pdwh.geoPath, sc.geoPath] });
    }
    // Indents (StaTwig pull model): the headmaster has asked for more; one approved and waiting to ship; one already fulfilled.
    const head = s.users.find((u) => u.persona === 'tn-head');
    const mk = (req: FacilityDto, by: ActorRef, status: IndentDto['status'], when: Date, lines: [string, number][], extra: Partial<IndentDto> = {}): IndentDto => {
      const i: IndentDto = {
        id: newId(s), indentNo: nextNo(s, 'IND', when), requesting: facRef(req), supplying: facRef(pdwh), neededBy: localDate(addDays(when, 2)), reason: 'SHORTFALL', status,
        lines: lines.map(([cid, q]) => { const c = s.commodities.find((x) => x.id === cid)!; return { commodityId: cid, commodityName: c.name, unit: c.unit, requested: q, approved: status === 'SUBMITTED' ? 0 : q, shipped: 0, received: 0 }; }),
        shipmentIds: [], history: [{ status: 'SUBMITTED', at: iso(when), actor: by }], createdAt: iso(when), createdBy: by, ...extra,
      };
      if (status !== 'SUBMITTED') i.history.push({ status: 'APPROVED', at: iso(addDays(when, 0.1)), actor: whOp });
      s.indents.push(i);
      return i;
    };
    mk(personaSchool, head ? actor(head) : fieldActor(personaSchool), 'SUBMITTED', at(0, 8, 15), [['c-EGG', 120], ['c-RICE', 20]], { notes: 'Attendance is up after the festival holidays; eggs will run out on Thursday.' });
    mk(schC!, fieldActor(schC!), 'APPROVED', at(-1, 14), [['c-EGG', 90]]);
    const done = mk(schA!, fieldActor(schA!), 'FULFILLED', at(-1, 10), [['c-EGG', 150], ['c-RICE', 40]], { shipmentIds: [shA.id] });
    done.lines.forEach((l) => { l.shipped = l.approved; l.received = l.approved; });
    done.history.push({ status: 'FULFILLED', at: iso(at(0, 7, 40)), actor: whOp });
    shA.indentId = done.id; shA.indentNo = done.indentNo;
    // 2) Delayed delivery: dispatched yesterday, never arrived
    const lateSchool = schools.find((sc) => sc.districtName === spec.districts[spec.districts.length - 1]!.name && sc.id !== personaSchool.id)!;
    const ldwh = districtsOf(lateSchool);
    const late = transfer(ldwh, lateSchool, new Map([['c-EGG', 90], ['c-VEG', 25]]), at(-1, 9), null)!;
    late.status = 'DELAYED';
    late.expectedArrivalAt = iso(at(-1, 14));
    late.delayHours = round((Date.now() - at(-1, 14).getTime()) / 3_600_000, 1);
    late.route = Array.from({ length: 8 }, (_, i) => ({ lat: ldwh.location!.lat + ((lateSchool.location!.lat - ldwh.location!.lat) * i) / 16, lng: ldwh.location!.lng + ((lateSchool.location!.lng - ldwh.location!.lng) * i) / 16, at: iso(at(-1, 9, 20 + i * 12)) }));
    late.lastLocation = { ...late.route[late.route.length - 1]!, source: 'GPS' };
    late.milestones.push({ status: 'IN_TRANSIT', at: iso(at(-1, 9, 20)), actor: fieldActor(ldwh) }, { status: 'DELAYED', at: iso(at(-1, 20)), note: 'No arrival 6 h after the expected time; last GPS fix at 10:44', actor: { userId: 'system', name: 'System', role: 'SUPER_ADMIN' } });
    raise(s, `DELAY:${late.id}`, { ...rules.shipmentDelay(Math.max(late.delayHours, 12), config, late.shipmentNo)!, detail: `Expected arrival window has passed without an arrival or receipt. ${ldwh.name} → ${lateSchool.name}. Last GPS fix 10:44 yesterday.` }, { geoPath: lateSchool.geoPath, facility: facRef(lateSchool), entity: { kind: 'SHIPMENT', id: late.id, label: late.shipmentNo }, link: `/logistics/shipments/${late.id}` }, at(-1, 20));
    // 3) Adjustment waiting for the district officer
    const riceAtDwh = [...s.lots].filter((l) => l.status === 'RELEASED' && l.commodity.unit === 'KG').sort((a, b) => available(cell(s, pdwh.id, b.id)) - available(cell(s, pdwh.id, a.id)))[0];
    if (riceAtDwh) {
      s.adjustments.push({ id: newId(s), adjNo: nextNo(s, 'ADJ'), facility: facRef(pdwh), lot: { id: riceAtDwh.id, code: riceAtDwh.code, commodityId: riceAtDwh.commodity.id, commodityName: riceAtDwh.commodity.name, unit: riceAtDwh.commodity.unit, expiresOn: riceAtDwh.expiresOn, status: riceAtDwh.status }, quantityDelta: -12, reason: 'PEST', remarks: 'Two bags gnawed by rodents found in the cycle count; contents swept and disposed.', status: 'PENDING', requestedBy: whOp, requestedAt: iso(at(0, 9, 10)) });
    }
    // 4) A purchase order waiting for a second officer, and a draft
    const cau = s.suppliers.find((x) => x.code === 'SUP-CAU')!;
    const next = poFor(cau, [{ c: com('RICE'), qty: 15_000 }, { c: com('RAGI'), qty: 2_000 }], at(0, 9, 40));
    next.status = 'PENDING_APPROVAL';
    next.history = next.history.slice(0, 2);
    next.expectedDeliveryDate = localDate(addDays(midnight, 9));
    next.notes = 'Next cycle. Deliver in 50 kg HDPE bags with lot labels printed from NutriTrace.';
    s.audit.pop();
    const vai = s.suppliers.find((x) => x.code === 'SUP-VAI')!;
    const draft = poFor(vai, [{ c: com('MOONG'), qty: 1_800 }], at(0, 10, 5));
    draft.status = 'DRAFT';
    draft.history = draft.history.slice(0, 1);
    draft.notes = `Replacement for recalled ${recalledLot?.code}. Hold until CAPA closes.`;
    s.audit.pop();
    // 5) Expiry risk at the state warehouse
    const rava = dryLots.get('RAVA')?.[0];
    if (rava) {
      const onHand = cell(s, stateWh.id, rava.id)?.onHand ?? 0;
      const c = rules.expiry(24, round(onHand), config, `${rava.code} (${round(onHand)} kg at ${stateWh.name})`);
      if (c) raise(s, `EXP:${rava.id}`, c, { geoPath: stateWh.geoPath, facility: facRef(stateWh), entity: { kind: 'LOT', id: rava.id, label: rava.code }, link: `/trace/lots/${rava.id}` }, at(0, 6));
    }
    s.capas.push(
      { id: newId(s), capaNo: nextNo(s, 'CAPA'), title: 'Moisture control for toor dal deliveries', description: 'Supplier to add moisture readings to the dispatch note; warehouse to sample bottom-layer bags.', source: 'INSPECTION', facility: facRef(stateWh), ownerName: 'Vaigai Pulses & Grains', dueDate: localDate(addDays(midnight, -2)), severity: 'HIGH', status: 'OPEN', log: [{ status: 'OPEN', note: 'Raised after failed receipt inspection', at: iso(at(start - 4, 16)), by: inspector }], createdAt: iso(at(start - 4, 16)) },
      { id: newId(s), capaNo: nextNo(s, 'CAPA'), title: 'Backup LPG cylinder at every school kitchen', description: `Interruption at ${scenarioSchools.shortfall.name} left children without lunch.`, source: 'COMPLAINT', facility: facRef(scenarioSchools.shortfall), ownerName: 'Block Education Officer', dueDate: localDate(addDays(midnight, 10)), severity: 'MEDIUM', status: 'PENDING_VERIFICATION', log: [{ status: 'OPEN', note: 'Raised', at: iso(at(-1, 16)), by: approver }, { status: 'PENDING_VERIFICATION', note: 'Cylinders supplied to 6 schools in the block', at: iso(at(0, 10)), by: approver }], createdAt: iso(at(-1, 16)) },
    );
  }

  /* ── End-of-seed rule checks and housekeeping ── */
  const cutoff = at(0, config.thresholds.schoolReportCutoffHour);
  for (const sc of schools) for (const mt of mealTypesOf(sc)) {
    if (!s.services.some((x) => x.school.id === sc.id && x.date === localDate(midnight) && x.mealType === mt) && mt === 'BREAKFAST') {
      raise(s, `MISSING:${sc.id}:${localDate(midnight)}:${mt}`, { type: 'MISSING_SCHOOL_REPORT', severity: 'MEDIUM', title: `${sc.name} has not reported breakfast for today`, detail: 'Breakfast service should be reported by 10:00. Contact the headmaster.', slaHours: 24 }, { geoPath: sc.geoPath, facility: facRef(sc), entity: { kind: 'SCHOOL', id: sc.id, label: sc.name }, link: `/schools/${sc.id}` }, at(0, 10, 15));
    }
  }
  void cutoff;
  // Older routine exceptions were handled — leave a realistic resolution trail.
  for (const e of s.exceptions) {
    const age = (Date.now() - new Date(e.createdAt).getTime()) / 86_400_000;
    if ((e.type === 'QUANTITY_MISMATCH' && age > 5) || (e.type === 'UNUSUAL_WASTAGE' && age > 3) || (e.type === 'MEAL_SHORTFALL' && age > 2.5)) {
      autoResolve(s, e.dedupeKey, 'Reconciled with block team; explanation recorded', new Date(new Date(e.createdAt).getTime() + 20 * 3_600_000));
      e.log[e.log.length - 1]!.action = 'RESOLVED';
      e.log[e.log.length - 1]!.by = approver;
    } else if (e.type === 'UNUSUAL_WASTAGE') {
      e.status = 'ACKNOWLEDGED';
      e.log.push({ action: 'ACKNOWLEDGE', note: 'Attendance dropped after heavy rain; headmaster informed', at: iso(addDays(new Date(e.createdAt), 0.1)), by: actor(U('BLOCK_COORDINATOR')) });
    }
  }
  for (const l of s.lots) {
    const total = [...s.stock.values()].filter((c) => c.lotId === l.id).reduce((a, c) => a + c.onHand, 0);
    if (total <= 0.001 && l.status === 'RELEASED' && !s.shipments.some((sh) => ['DISPATCHED', 'IN_TRANSIT', 'DELAYED'].includes(sh.status) && sh.lines.some((x) => x.lotId === l.id))) l.status = 'DEPLETED';
  }
  for (const sc of schools) {
    for (let k = 0; k < 3; k++) {
      const d = at(-k * 4 - rng.int(0, 2), 7, 10);
      const items = [['water', 'Drinking water source tested / RO working'], ['cook_health', 'Cooks in clean attire, hairnet and apron'], ['handwash', 'Handwash with soap before cooking and serving'], ['storage', 'Grains stored off-floor in covered bins'], ['pest', 'No signs of pests in store or kitchen'], ['utensils', 'Utensils washed and dried'], ['fuel', 'LPG cylinder and stove safe'], ['taste', 'Food tasted by two adults before serving']].map(([key, label]) => ({ key: key!, label: label!, passed: rng.chance(0.93) }));
      s.hygiene.push({ id: newId(s), facilityId: sc.id, facility: facRef(sc), date: localDate(d), items, score: Math.round((items.filter((i) => i.passed).length / items.length) * 100), checkedBy: fieldActor(sc), createdAt: iso(d) });
    }
  }
  for (const u of s.users.filter((x) => x.persona)) audit(s, actor(u), 'identity.login', { kind: 'USER', id: u.id, label: u.username }, undefined, new Date(u.lastLoginAt!));

  sealAll(s);
  s.audit.sort((a, b) => b.at.localeCompare(a.at));
  void permissionsFor;
  return s;
}

/** Lazily build each demo state on first use (Tamil Nadu is built at start-up). */
export function getStore(code: string) {
  const { stores } = storeModule;
  if (!stores.has(code)) stores.set(code, buildTenant(code));
  return stores.get(code)!;
}
import * as storeModule from '../store';
export type { TraceEventDto };
