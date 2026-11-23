import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type {
  AdjustmentCreateInput, AdjustmentDto, AreaPerformanceDto, AuditLogDto, CapaCreateInput, CapaDto, CommodityDto, ExceptionActionInput, ExceptionDto, FacilityCreateInput,
  FacilityDto, GeoUnitDto, GrnCreateInput, GrnDto, HygieneCheckDto, HygieneCheckInput, InspectionCreateInput, InspectionDto, LedgerEntryDto, LedgerVerificationDto,
  LoginInput, LoginResult, LotDto, LotJourneyDto, MealPlanDto, MealServiceCreateInput, MealServiceDto, NotificationDto, OverviewDto, PoCreateInput, PoDto,
  ProductionCreateInput, ProductionDto, QualityDecisionInput, RecallCreateInput, RecallDto, RecipeDto, Role, SchoolDayStatusDto, SessionUser, ShipmentCreateInput,
  ShipmentDto, StockRowDto, StockSummaryDto, SupplierCreateInput, SupplierDto, TenantConfig, TenantDto, TraceEventDto, TraceGraphDto, UserCreateInput, UserDto,
  UserUpdateInput, VehicleDto, AsnCreateInput, FefoPick, AccessConfig, ExchangeEntity, ImportResult, IndentDto, IndentCreateInput, TripDto, TripCreateInput, LastMileBoardDto, GeoUnitCreateInput, FacilityImportResult, CommodityCreateInput, VehicleCreateInput, RecipeInput, MenuUpdateInput,
} from '@nt/domain';
import { download, request, requestPage } from './http';

export type Query = Record<string, string | number | boolean | undefined | null>;
export interface PageResult<T> { data: T[]; meta: { page: number; pageSize: number; total: number } }

const page = <T,>(path: string, query?: Query) => requestPage<T>(path, { query });
const listOpts = <T,>(key: readonly unknown[], path: string, query?: Query) =>
  queryOptions({ queryKey: [...key, query ?? {}], queryFn: () => page<T>(path, query), placeholderData: keepPreviousData });
const one = <T,>(key: readonly unknown[], path: string, query?: Query, enabled = true) => queryOptions({ queryKey: [...key, query ?? {}], queryFn: () => request<T>(path, { query }), enabled });

/* ── Identity ── */
export const identity = {
  login: (body: LoginInput) => request<LoginResult & { user: SessionUser & { mustChangePassword?: boolean } }>('/identity/auth/login', { method: 'POST', body }),
  logout: () => request<void>('/identity/auth/logout', { method: 'POST' }),
  changePassword: (body: { currentPassword: string; newPassword: string; confirmPassword: string }) => request('/identity/auth/change-password', { method: 'POST', body }),
  me: () => request<SessionUser & { mustChangePassword?: boolean }>('/identity/auth/me'),
  users: (q?: Query) => listOpts<UserDto>(['users'], '/identity/users', q),
  roles: () => one<{ role: Role; label: string; permissions: string[] }[]>(['roles'], '/identity/roles'),
  createUser: (body: UserCreateInput) => request<UserDto>('/identity/users', { method: 'POST', body }),
  updateUser: (id: string, body: UserUpdateInput) => request<UserDto>(`/identity/users/${id}`, { method: 'PATCH', body }),
  resetPassword: (id: string) => request<{ temporaryPassword: string }>(`/identity/users/${id}/reset-password`, { method: 'POST' }),
};

/* ── Registry ── */
export const registry = {
  tenant: () => one<TenantDto>(['tenant'], '/registry/tenants/current'),
  tenants: () => one<TenantDto[]>(['tenants'], '/registry/tenants'),
  updateConfig: (body: TenantConfig) => request<TenantDto>('/registry/tenants/current/config', { method: 'PATCH', body }),
  geoUnits: (q?: Query) => one<GeoUnitDto[]>(['geo-units'], '/registry/geo-units', q),
  facilities: (q?: Query) => listOpts<FacilityDto>(['facilities'], '/registry/facilities', q),
  facility: (id: string) => one<FacilityDto>(['facility', id], `/registry/facilities/${id}`),
  createFacility: (body: FacilityCreateInput) => request<FacilityDto>('/registry/facilities', { method: 'POST', body }),
  commodities: () => one<CommodityDto[]>(['commodities'], '/registry/commodities'),
  suppliers: (q?: Query) => listOpts<SupplierDto>(['suppliers'], '/registry/suppliers', q),
  supplier: (id: string) => one<SupplierDto>(['supplier', id], `/registry/suppliers/${id}`),
  createSupplier: (body: SupplierCreateInput) => request<SupplierDto>('/registry/suppliers', { method: 'POST', body }),
  supplierStatus: (id: string, body: { status: 'APPROVED' | 'SUSPENDED'; reason: string }) => request<SupplierDto>(`/registry/suppliers/${id}/status`, { method: 'POST', body }),
  vehicles: () => one<VehicleDto[]>(['vehicles'], '/registry/vehicles'),
  createGeoUnit: (body: GeoUnitCreateInput) => request<GeoUnitDto>('/registry/geo-units', { method: 'POST', body }),
  renameGeoUnit: (id: string, name: string) => request<GeoUnitDto>(`/registry/geo-units/${id}`, { method: 'PATCH', body: { name } }),
  updateFacility: (id: string, body: Partial<FacilityCreateInput> & { active?: boolean }) => request<FacilityDto>(`/registry/facilities/${id}`, { method: 'PATCH', body }),
  importFacilities: (rows: Record<string, string>[], dryRun: boolean) => request<FacilityImportResult>('/registry/facilities/import', { method: 'POST', body: { rows, dryRun } }),
  saveAccess: (body: AccessConfig) => request<TenantDto>('/registry/tenants/current/access', { method: 'PUT', body }),
  createCommodity: (body: CommodityCreateInput) => request<CommodityDto>('/registry/commodities', { method: 'POST', body }),
  updateCommodity: (id: string, body: Partial<CommodityCreateInput> & { active?: boolean }) => request<CommodityDto>(`/registry/commodities/${id}`, { method: 'PATCH', body }),
  updateSupplier: (id: string, body: Partial<SupplierCreateInput>) => request<SupplierDto>(`/registry/suppliers/${id}`, { method: 'PATCH', body }),
  createVehicle: (body: VehicleCreateInput) => request<VehicleDto>('/registry/vehicles', { method: 'POST', body }),
  updateVehicle: (id: string, body: Partial<VehicleCreateInput> & { active?: boolean }) => request<VehicleDto>(`/registry/vehicles/${id}`, { method: 'PATCH', body }),
};

/* ── Procurement ── */
export const procurement = {
  orders: (q?: Query) => listOpts<PoDto>(['pos'], '/procurement/purchase-orders', q),
  order: (id: string) => one<PoDto & { asns: AsnDto[] }>(['po', id], `/procurement/purchase-orders/${id}`),
  createOrder: (body: PoCreateInput & { submit: boolean }) => request<PoDto>('/procurement/purchase-orders', { method: 'POST', body }),
  decide: (id: string, body: { decision: 'APPROVE' | 'REJECT'; comment?: string }) => request<PoDto>(`/procurement/purchase-orders/${id}/decision`, { method: 'POST', body }),
  cancel: (id: string, reason: string) => request<PoDto>(`/procurement/purchase-orders/${id}/cancel`, { method: 'POST', body: { reason } }),
  createAsn: (body: AsnCreateInput) => request<AsnDto>('/procurement/asns', { method: 'POST', body }),
  performance: (supplierId: string) => one<SupplierPerformance>(['supplier-perf', supplierId], `/procurement/suppliers/${supplierId}/performance`),
};
export interface AsnDto { id: string; asnNo: string; poId: string; invoiceNo: string; vehicleNo: string; dispatchedAt: string; expectedArrivalAt: string; lots: { lotId: string; lotCode: string; commodityName: string; unit: string; quantity: number; supplierLotNo: string; expiresOn: string }[] }
export interface PublicLotDto { code: string; commodity: string; supplier: string; origin: { district: string; state: string }; packedOn: string; expiresOn: string; status: string; stageReached: string; safeToUse: boolean }
export interface SupplierPerformance { orders: number; lotsSupplied: number; ordered: number; received: number; accepted: number; onTimePct: number; inFullPct: number; qualityPassPct: number }

/* ── Inventory ── */
export const inventory = {
  stock: (q?: Query) => listOpts<StockRowDto>(['stock'], '/inventory/stock', q),
  summary: (q?: Query) => one<StockSummaryDto[]>(['stock-summary'], '/inventory/stock/summary', q),
  fefo: (q: Query, enabled: boolean) => one<{ picks: FefoPick[]; shortfall: number }>(['fefo'], '/inventory/stock/fefo', q, enabled),
  ledger: (q?: Query) => listOpts<LedgerEntryDto>(['ledger'], '/inventory/ledger', q),
  receipts: (q?: Query) => listOpts<GrnDto>(['receipts'], '/inventory/receipts', q),
  receipt: (id: string) => one<GrnDto>(['receipt', id], `/inventory/receipts/${id}`),
  receive: (body: GrnCreateInput, idempotencyKey: string) => request<GrnDto>('/inventory/receipts', { method: 'POST', body, idempotencyKey }),
  adjustments: (q?: Query) => listOpts<AdjustmentDto>(['adjustments'], '/inventory/adjustments', q),
  requestAdjustment: (body: AdjustmentCreateInput) => request<AdjustmentDto>('/inventory/adjustments', { method: 'POST', body }),
  decideAdjustment: (id: string, body: { decision: 'APPROVE' | 'REJECT'; comment: string }) => request<AdjustmentDto>(`/inventory/adjustments/${id}/decision`, { method: 'POST', body }),
};

/* ── Logistics ── */
export const logistics = {
  shipments: (q?: Query) => listOpts<ShipmentDto>(['shipments'], '/logistics/shipments', q),
  shipment: (id: string) => one<ShipmentDto>(['shipment', id], `/logistics/shipments/${id}`),
  create: (body: ShipmentCreateInput) => request<ShipmentDto>('/logistics/shipments', { method: 'POST', body }),
  dispatch: (id: string, body: { vehicleNo: string; driverName: string; driverPhone: string; transporterName?: string; sealNo?: string }) => request<ShipmentDto>(`/logistics/shipments/${id}/dispatch`, { method: 'POST', body }),
  milestone: (id: string, body: { status: string; note?: string }) => request<ShipmentDto>(`/logistics/shipments/${id}/milestones`, { method: 'POST', body }),
  cancel: (id: string, reason: string) => request<ShipmentDto>(`/logistics/shipments/${id}/cancel`, { method: 'POST', body: { reason } }),
};

/* ── Indents & last mile ── */
export const indents = {
  list: (q?: Query) => listOpts<IndentDto>(['indents'], '/logistics/indents', q),
  get: (id: string) => one<IndentDto>(['indent', id], `/logistics/indents/${id}`),
  create: (body: IndentCreateInput) => request<IndentDto>('/logistics/indents', { method: 'POST', body }),
  decide: (id: string, body: { decision: 'APPROVE' | 'REJECT'; comment?: string; approved?: { commodityId: string; quantity: number }[] }) => request<IndentDto>(`/logistics/indents/${id}/decision`, { method: 'POST', body }),
  cancel: (id: string, reason: string) => request<IndentDto>(`/logistics/indents/${id}/cancel`, { method: 'POST', body: { reason } }),
};
export const trips = {
  list: (q?: Query) => listOpts<TripDto>(['trips'], '/logistics/trips', q),
  get: (id: string) => one<TripDto>(['trip', id], `/logistics/trips/${id}`),
  board: (date: string) => one<LastMileBoardDto>(['last-mile', date], '/logistics/last-mile/board', { date }),
  create: (body: TripCreateInput) => request<TripDto>('/logistics/trips', { method: 'POST', body }),
  start: (id: string) => request<TripDto>(`/logistics/trips/${id}/start`, { method: 'POST' }),
  arrive: (id: string, seq: number, geo?: { lat: number; lng: number }) => request<TripDto>(`/logistics/trips/${id}/stops/${seq}/arrive`, { method: 'POST', body: { geo } }),
  handover: (id: string, seq: number, body: { receivedBy: string; receiverRole?: string; note?: string; photoName?: string; geo?: { lat: number; lng: number } }) => request<TripDto>(`/logistics/trips/${id}/stops/${seq}/handover`, { method: 'POST', body }),
  fail: (id: string, seq: number, body: { reason: string; note?: string }) => request<TripDto>(`/logistics/trips/${id}/stops/${seq}/fail`, { method: 'POST', body }),
};

/* ── Meals ── */
export const meals = {
  recipes: (q?: Query) => one<RecipeDto[]>(['recipes'], '/meals/recipes', q),
  approveRecipe: (id: string) => request(`/meals/recipes/${id}/approve`, { method: 'POST' }),
  createRecipe: (body: RecipeInput) => request<RecipeDto>('/meals/recipes', { method: 'POST', body }),
  updateRecipe: (id: string, body: Partial<RecipeInput>) => request<RecipeDto>(`/meals/recipes/${id}`, { method: 'PATCH', body }),
  saveMenu: (programmeCode: string, body: MenuUpdateInput) => request(`/meals/menus/${programmeCode}`, { method: 'PUT', body }),
  menus: () => one<{ programmeCode: string; days: { dayOfWeek: number; meals: { mealType: string; recipeCode: string }[] }[] }[]>(['menus'], '/meals/menus'),
  plans: (q: Query, enabled = true) => one<MealPlanDto[]>(['plans'], '/meals/plans', q, enabled),
  productions: (q?: Query) => listOpts<ProductionDto>(['productions'], '/meals/productions', q),
  production: (id: string) => one<ProductionDto>(['production', id], `/meals/productions/${id}`),
  produce: (body: ProductionCreateInput, idempotencyKey: string) => request<ProductionDto>('/meals/productions', { method: 'POST', body, idempotencyKey }),
  services: (q?: Query) => listOpts<MealServiceDto>(['services'], '/meals/services', q),
  status: (q: Query) => one<SchoolDayStatusDto[]>(['service-status'], '/meals/services/status', q),
  report: (body: MealServiceCreateInput, idempotencyKey: string) => request<MealServiceDto>('/meals/services', { method: 'POST', body, idempotencyKey }),
  hygieneTemplate: () => one<{ key: string; label: string }[]>(['hygiene-template'], '/meals/hygiene-checks/template'),
  hygieneChecks: (q?: Query) => listOpts<HygieneCheckDto>(['hygiene'], '/meals/hygiene-checks', q),
  recordHygiene: (body: HygieneCheckInput) => request<HygieneCheckDto>('/meals/hygiene-checks', { method: 'POST', body }),
};

/* ── Quality ── */
export const quality = {
  inspections: (q?: Query) => listOpts<InspectionDto>(['inspections'], '/quality/inspections', q),
  inspection: (id: string) => one<InspectionDto>(['inspection', id], `/quality/inspections/${id}`),
  inspect: (body: InspectionCreateInput) => request<InspectionDto>('/quality/inspections', { method: 'POST', body }),
  decide: (id: string, body: QualityDecisionInput) => request<InspectionDto>(`/quality/inspections/${id}/decision`, { method: 'POST', body }),
  capas: (q?: Query) => listOpts<CapaDto>(['capa'], '/quality/capa', q),
  createCapa: (body: CapaCreateInput) => request<CapaDto>('/quality/capa', { method: 'POST', body }),
  updateCapa: (id: string, body: { status: string; note: string }) => request<CapaDto>(`/quality/capa/${id}`, { method: 'PATCH', body }),
  recalls: (q?: Query) => listOpts<RecallDto>(['recalls'], '/quality/recalls', q),
  recall: (id: string) => one<RecallDto>(['recall', id], `/quality/recalls/${id}`),
  initiateRecall: (body: RecallCreateInput) => request<RecallDto>('/quality/recalls', { method: 'POST', body }),
  acknowledge: (id: string, body: { facilityId: string; quarantinedQty: number; note?: string }) => request<RecallDto>(`/quality/recalls/${id}/acknowledgements`, { method: 'POST', body }),
  closeRecall: (id: string, note: string) => request<RecallDto>(`/quality/recalls/${id}/close`, { method: 'POST', body: { note } }),
};

/* ── Trace ── */
export const trace = {
  lots: (q?: Query) => listOpts<LotDto>(['lots'], '/trace/lots', q),
  resolve: (code: string) => request<{ id: string; code: string }>('/trace/lots/resolve', { query: { code } }),
  journey: (id: string) => one<LotJourneyDto>(['journey', id], `/trace/lots/${id}/journey`),
  graph: (id: string, direction: 'forward' | 'backward') => one<TraceGraphDto>(['graph', id, direction], `/trace/lots/${id}/graph`, { direction }),
  sources: (facilityId: string, from: string, to: string) =>
    one<{ graph: TraceGraphDto; usage: { lot: LotDto; consumed: number; batches: number }[]; mealsServed: number; days: number }>(['sources', facilityId], `/trace/facilities/${facilityId}/sources`, { from, to }, !!facilityId),
  events: (q?: Query) => listOpts<TraceEventDto>(['events'], '/trace/events', q),
  verify: () => one<LedgerVerificationDto>(['verify'], '/trace/ledger/verify', undefined, false),
  publicLot: (code: string) => one<PublicLotDto>(['public-lot', code], `/trace/public/lots/${encodeURIComponent(code)}`),
};

/* ── Insight ── */
export const insight = {
  overview: (q: Query) => one<OverviewDto>(['overview'], '/insight/dashboard/overview', q),
  areas: (q: Query) => one<AreaPerformanceDto[]>(['areas'], '/insight/dashboard/areas', q),
  exceptions: (q?: Query) => listOpts<ExceptionDto>(['exceptions'], '/insight/exceptions', q),
  exception: (id: string) => one<ExceptionDto>(['exception', id], `/insight/exceptions/${id}`),
  act: (id: string, body: ExceptionActionInput) => request<ExceptionDto>(`/insight/exceptions/${id}/actions`, { method: 'POST', body }),
  notifications: () => queryOptions({ queryKey: ['notifications'], queryFn: () => request<NotificationDto[]>('/insight/notifications'), refetchInterval: 60_000 }),
  markRead: (ids: string[]) => request('/insight/notifications/read', { method: 'POST', body: { ids } }),
  audit: (q?: Query) => listOpts<AuditLogDto>(['audit'], '/insight/audit-logs', q),
  exportReport: (key: string, q: Query) => download(`/insight/reports/${key}`, q, `${key}.csv`),
};

/* ── Admin Console ── */
export interface RegistryHealth { facilities: Record<string, number>; facilitiesWithoutCoordinates: number; schoolsWithoutKitchenLink: number; inactiveFacilities: number; suppliers: Record<string, number>; suppliersLicenceExpiring: number; products: number; locations: Record<string, number> }
export interface UserStats { byRole: Record<string, number>; total: number; neverSignedIn: number; suspended: number; mustChangePassword: number; schoolsWithHead: number }
export const adminApi = {
  health: () => one<RegistryHealth>(['registry-health'], '/registry/health'),
  userStats: () => one<UserStats>(['user-stats'], '/identity/users/stats'),
};
/* ── Data exchange (Admin Console) ── */
export const exchange = {
  import: (entity: ExchangeEntity, rows: Record<string, string>[], dryRun: boolean) =>
    request<ImportResult>(entity === 'users' ? '/identity/users/import' : `/registry/import/${entity}`, { method: 'POST', body: { rows, dryRun } }),
  export: (entity: ExchangeEntity) => download(entity === 'users' ? '/identity/export/users' : `/registry/export/${entity}`, {}, `${entity}.csv`),
  history: () => one<PageResult<AuditLogDto>>(['exchange-history'], '/insight/audit-logs', { q: '', action: 'ported', pageSize: 50 }),
};
