import type {
  ActorRef, AdjustmentDto, AuditLogDto, CapaDto, CommodityDto, ExceptionDto, FacilityDto, GeoUnitDto, GrnDto, HygieneCheckDto, InspectionDto, LedgerEntryDto,
  LotDto, MealServiceDto, NotificationDto, PoDto, ProductionDto, RecallDto, Role, ShipmentDto, SupplierDto, TenantDto, TraceEventDto, UnhashedEvent, UserDto, VehicleDto,
  SchoolCategory, MealType, IndentDto, TripDto,
} from '@nt/domain';
import type { AsnDto } from '@/lib/api';

export interface StockCell { facilityId: string; lotId: string; onHand: number; reserved: number; receivedAt: string; lastMovementAt: string }
export interface RecipeRow {
  id: string; code: string; name: string; mealType: MealType; description?: string; version: number; status: 'APPROVED' | 'DRAFT' | 'RETIRED';
  ingredients: { commodityId: string; perServing: Record<SchoolCategory, number> }[]; approvedBy?: ActorRef; approvedAt?: string;
}
export interface MenuRow { programmeCode: string; days: { dayOfWeek: number; meals: { mealType: MealType; recipeCode: string }[] }[] }
export interface ExceptionRow extends Omit<ExceptionDto, 'ageHours' | 'overdue'> { dedupeKey: string }
export interface NotificationRow extends Omit<NotificationDto, 'read'> { geoPath: string; readBy: string[] }
export interface DemoUser extends UserDto { persona?: string; facilityName?: string }

/** Everything one state programme holds. The mock server reads and writes only this. */
export interface TenantStore {
  tenant: TenantDto;
  geo: GeoUnitDto[];
  facilities: FacilityDto[];
  facilityById: Map<string, FacilityDto>;
  commodities: CommodityDto[];
  suppliers: SupplierDto[];
  vehicles: VehicleDto[];
  users: DemoUser[];
  pos: PoDto[];
  asns: AsnDto[];
  lots: LotDto[];
  lotById: Map<string, LotDto>;
  stock: Map<string, StockCell>;
  ledger: LedgerEntryDto[];
  grns: GrnDto[];
  adjustments: AdjustmentDto[];
  shipments: (ShipmentDto & { geoPaths: string[] })[];
  reservations: Map<string, { facilityId: string; lines: { lotId: string; quantity: number }[]; status: string }>;
  recipes: RecipeRow[];
  menus: MenuRow[];
  productions: ProductionDto[];
  services: MealServiceDto[];
  hygiene: HygieneCheckDto[];
  inspections: InspectionDto[];
  capas: Omit<CapaDto, 'overdue'>[];
  recalls: Omit<RecallDto, 'stats'>[];
  events: TraceEventDto[];
  pending: UnhashedEvent[];
  sealed: boolean;
  byLot: Map<string, TraceEventDto[]>;
  byProduction: Map<string, TraceEventDto[]>;
  exceptions: ExceptionRow[];
  notifications: NotificationRow[];
  audit: AuditLogDto[];
  indents: IndentDto[];
  trips: TripDto[];
  counters: Record<string, number>;
  now: Date;
}

export const stores = new Map<string, TenantStore>();

export const SYSTEM: ActorRef = { userId: 'system', name: 'System', role: 'SUPER_ADMIN' as Role };
