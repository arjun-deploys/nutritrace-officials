/**
 * Role-based access control. Permissions are `resource:action` strings.
 * Roles are additionally constrained by geographic/facility scope (see Scope).
 * Resolved server-side at login and embedded in the access token; the UI
 * uses the same map only to hide affordances — never as the enforcement point.
 */

export const PERMISSIONS = [
  'dashboard:read',
  'trace:read',
  'master:read',
  'master:manage',
  'supplier:manage',
  'po:read',
  'po:create',
  'po:approve',
  'asn:create',
  'stock:read',
  'grn:create',
  'stock:adjust',
  'stock:adjust:approve',
  'shipment:read',
  'shipment:create',
  'shipment:update',
  'shipment:receive',
  'meal:read',
  'meal:plan',
  'meal:produce',
  'meal:serve:report',
  'nutrition:manage',
  'quality:read',
  'quality:inspect',
  'quality:decide',
  'recall:manage',
  'recall:acknowledge',
  'exception:read',
  'exception:manage',
  'report:export',
  'user:manage',
  'config:manage',
  'audit:read',
  'tenant:switch',
  'admin:access',
  'data:import',
  'data:export',
  'indent:read',
  'indent:create',
  'indent:approve',
  'trip:read',
  'trip:manage',
  'trip:run',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  'SUPER_ADMIN',
  'STATE_ADMIN',
  'DISTRICT_ADMIN',
  'DISTRICT_OFFICER',
  'BLOCK_COORDINATOR',
  'PROCUREMENT_OFFICER',
  'WAREHOUSE_OPERATOR',
  'TRANSPORT_COORDINATOR',
  'KITCHEN_MANAGER',
  'SCHOOL_HEAD',
  'QUALITY_INSPECTOR',
  'NUTRITIONIST',
  'AUDITOR',
] as const;
export type Role = (typeof ROLES)[number];

const READ_ALL: Permission[] = [
  'dashboard:read', 'trace:read', 'master:read', 'po:read', 'stock:read', 'shipment:read',
  'meal:read', 'quality:read', 'exception:read', 'indent:read', 'trip:read',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [...PERMISSIONS],
  STATE_ADMIN: PERMISSIONS.filter((p) => p !== 'tenant:switch'),
  DISTRICT_ADMIN: ['admin:access', 'user:manage', 'master:read', 'master:manage', 'data:import', 'data:export', 'audit:read', 'dashboard:read'],
  DISTRICT_OFFICER: [...READ_ALL, 'po:approve', 'stock:adjust:approve', 'exception:manage', 'report:export', 'recall:acknowledge', 'indent:approve'],
  BLOCK_COORDINATOR: [...READ_ALL, 'exception:manage', 'report:export', 'recall:acknowledge', 'indent:create'],
  PROCUREMENT_OFFICER: [...READ_ALL, 'supplier:manage', 'po:create', 'asn:create', 'report:export'],
  WAREHOUSE_OPERATOR: [...READ_ALL, 'grn:create', 'stock:adjust', 'shipment:create', 'shipment:update', 'shipment:receive', 'recall:acknowledge', 'indent:create', 'indent:approve', 'trip:manage'],
  TRANSPORT_COORDINATOR: [...READ_ALL, 'shipment:create', 'shipment:update', 'trip:manage', 'trip:run'],
  KITCHEN_MANAGER: [...READ_ALL, 'shipment:receive', 'grn:create', 'meal:plan', 'meal:produce', 'meal:serve:report', 'stock:adjust', 'recall:acknowledge', 'indent:create'],
  SCHOOL_HEAD: ['dashboard:read', 'trace:read', 'stock:read', 'shipment:read', 'meal:read', 'shipment:receive', 'grn:create', 'meal:produce', 'meal:serve:report', 'recall:acknowledge', 'exception:read', 'indent:read', 'indent:create', 'trip:read'],
  QUALITY_INSPECTOR: [...READ_ALL, 'quality:inspect', 'quality:decide', 'recall:manage', 'exception:manage'],
  NUTRITIONIST: [...READ_ALL, 'nutrition:manage', 'meal:plan', 'report:export'],
  AUDITOR: [...READ_ALL, 'audit:read', 'report:export'],
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Platform administrator',
  STATE_ADMIN: 'State programme administrator',
  DISTRICT_ADMIN: 'District data administrator',
  DISTRICT_OFFICER: 'District officer',
  BLOCK_COORDINATOR: 'Block coordinator',
  PROCUREMENT_OFFICER: 'Procurement officer',
  WAREHOUSE_OPERATOR: 'Warehouse operator',
  TRANSPORT_COORDINATOR: 'Transport coordinator',
  KITCHEN_MANAGER: 'Kitchen manager',
  SCHOOL_HEAD: 'Headmaster / school in-charge',
  QUALITY_INSPECTOR: 'Quality inspector',
  NUTRITIONIST: 'Nutritionist',
  AUDITOR: 'Auditor (read-only)',
};

/** Roles that must be pinned to a single facility rather than a geography. */
export const FACILITY_BOUND_ROLES: readonly Role[] = ['WAREHOUSE_OPERATOR', 'KITCHEN_MANAGER', 'SCHOOL_HEAD'];

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(granted: readonly string[] | undefined, permission: Permission): boolean {
  return !!granted && granted.includes(permission);
}

/**
 * Data scope. `geoPath` is a materialised path such as `TN/CHN/CHN-B01`.
 * A user sees every record whose geoPath starts with their scope path.
 */
export interface Scope {
  tenantId: string;
  geoPath: string;
  facilityIds?: string[];
}

export function isWithinScope(scope: Pick<Scope, 'geoPath'>, recordGeoPath: string | undefined | null): boolean {
  if (!recordGeoPath) return false;
  return recordGeoPath === scope.geoPath || recordGeoPath.startsWith(`${scope.geoPath}/`);
}

/* ───────── Permission catalogue (grouped, as in StaTwig's role editor) ───────── */
export interface PermissionInfo { key: Permission; label: string; description: string }
export interface PermissionGroup { key: string; label: string; permissions: PermissionInfo[] }
const P = (key: Permission, label: string, description: string): PermissionInfo => ({ key, label, description });
export const PERMISSION_GROUPS: PermissionGroup[] = [
  { key: 'admin', label: 'Admin & configuration', permissions: [
    P('admin:access', 'Open the Admin Console', 'Access to the administration portal'),
    P('user:manage', 'Manage users', 'Onboard, edit, suspend users and reset passwords within their area'),
    P('master:manage', 'Manage master data', 'Locations, schools and facilities, products, vehicles'),
    P('config:manage', 'Programme settings and roles', 'Thresholds, norms and role permissions'),
    P('data:import', 'Import data', 'Bulk import from spreadsheets'),
    P('data:export', 'Export data', 'Download master data and registers'),
    P('audit:read', 'Read audit trail', 'See who changed what and when'),
    P('tenant:switch', 'Switch state', 'Platform staff only'),
  ] },
  { key: 'overview', label: 'Overview & analytics', permissions: [
    P('dashboard:read', 'Command centre', 'Dashboards for the user’s area'),
    P('master:read', 'View master data', 'See facilities, suppliers and products'),
    P('report:export', 'Download reports', 'Meal, shipment, exception and stock registers'),
  ] },
  { key: 'orders', label: 'Procurement & indents', permissions: [
    P('po:read', 'View purchase orders', ''), P('po:create', 'Raise purchase orders', ''), P('po:approve', 'Approve purchase orders', 'Second-officer approval'),
    P('asn:create', 'Record supplier dispatch', 'Creates lots and their codes'), P('supplier:manage', 'Register suppliers', ''),
    P('indent:read', 'View indents', ''), P('indent:create', 'Raise indents', 'Request stock from the level above'), P('indent:approve', 'Approve and fulfil indents', ''),
  ] },
  { key: 'inventory', label: 'Inventory', permissions: [
    P('stock:read', 'View stock', ''), P('grn:create', 'Receive goods', 'Record received, accepted and rejected quantities'),
    P('stock:adjust', 'Request stock adjustments', ''), P('stock:adjust:approve', 'Approve stock adjustments', ''),
  ] },
  { key: 'shipments', label: 'Shipments', permissions: [
    P('shipment:read', 'View shipments', ''), P('shipment:create', 'Plan shipments', ''), P('shipment:update', 'Dispatch and update shipments', ''), P('shipment:receive', 'Receive shipments', ''),
  ] },
  { key: 'last_mile', label: 'Last mile & trips', permissions: [
    P('trip:read', 'View trips and last-mile board', ''), P('trip:manage', 'Plan delivery trips', 'Group shipments into one vehicle run'), P('trip:run', 'Run a trip', 'Driver / delivery agent: start trip, arrive at stops, record handover'),
  ] },
  { key: 'meals', label: 'Kitchen & schools', permissions: [
    P('meal:read', 'View meals', ''), P('meal:plan', 'Plan meals', ''), P('meal:produce', 'Record cooking', ''), P('meal:serve:report', 'Report meal service', ''), P('nutrition:manage', 'Manage recipes and menus', ''),
  ] },
  { key: 'quality', label: 'Quality & recalls', permissions: [
    P('quality:read', 'View inspections', ''), P('quality:inspect', 'Record inspections', ''), P('quality:decide', 'Release / hold / reject lots', ''),
    P('recall:manage', 'Run recalls', ''), P('recall:acknowledge', 'Acknowledge recalls', ''),
  ] },
  { key: 'trace', label: 'Track & trace', permissions: [P('trace:read', 'Trace lots', 'Forward and backward traceability')] },
  { key: 'exceptions', label: 'Exceptions', permissions: [P('exception:read', 'View exceptions', ''), P('exception:manage', 'Act on exceptions', '')] },
];

/* ───────── Configurable access per state ───────── */
export interface CustomRole {
  id: string;
  name: string;
  description?: string;
  /** Behaves like this system role for scope and landing page. */
  baseRole: Role;
  permissions: Permission[];
  active: boolean;
}
export interface AccessConfig {
  /** Replaces the default permission set of a system role, for this state. */
  overrides?: Partial<Record<Role, Permission[]>>;
  customRoles?: CustomRole[];
}

/** Permissions for a user: custom role > state override > platform default. Platform-only rights stay platform-only. */
export function resolvePermissions(role: Role, access?: AccessConfig, customRoleId?: string): Permission[] {
  const custom = customRoleId ? access?.customRoles?.find((r) => r.id === customRoleId && r.active) : undefined;
  const set = custom?.permissions ?? access?.overrides?.[role] ?? ROLE_PERMISSIONS[role] ?? [];
  return role === 'SUPER_ADMIN' ? [...PERMISSIONS] : set.filter((p) => p !== 'tenant:switch');
}

export const ADMIN_ROLES: readonly Role[] = ['SUPER_ADMIN', 'STATE_ADMIN', 'DISTRICT_ADMIN'];
