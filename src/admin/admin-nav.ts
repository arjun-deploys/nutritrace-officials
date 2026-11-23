import { ArrowLeftRight, Building2, FileText, LayoutDashboard, Map, Package, Settings2, ShieldCheck, Store, Truck, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Permission } from '@nt/domain';

export interface AdminNavItem { key: string; label: string; to: string; icon: LucideIcon; permission: Permission; hint: string }
export interface AdminNavGroup { key: string; label: string; items: AdminNavItem[] }

/** Mirrors StaTwig's admin portal: overview, people, structure, catalogue, configuration, logs. */
export const ADMIN_NAV: AdminNavGroup[] = [
  { key: 'home', label: 'Console', items: [
    { key: 'overview', label: 'Overview', to: '/admin', icon: LayoutDashboard, permission: 'admin:access', hint: 'Data health and recent changes' },
  ] },
  { key: 'people', label: 'People & access', items: [
    { key: 'users', label: 'Users', to: '/admin/users', icon: Users, permission: 'user:manage', hint: 'Onboard staff, assign role and location' },
    { key: 'roles', label: 'Roles & access', to: '/admin/roles', icon: ShieldCheck, permission: 'config:manage', hint: 'What each role can see and do' },
  ] },
  { key: 'structure', label: 'Structure', items: [
    { key: 'locations', label: 'Levels & locations', to: '/admin/locations', icon: Map, permission: 'master:read', hint: 'State › district › block' },
    { key: 'facilities', label: 'Schools & facilities', to: '/admin/facilities', icon: Building2, permission: 'master:read', hint: 'Warehouses, kitchens, schools' },
  ] },
  { key: 'catalogue', label: 'Catalogue', items: [
    { key: 'products', label: 'Products', to: '/admin/products', icon: Package, permission: 'master:read', hint: 'Food items and nutrition' },
    { key: 'suppliers', label: 'Suppliers', to: '/admin/suppliers', icon: Store, permission: 'po:read', hint: 'Registration and approval' },
    { key: 'vehicles', label: 'Vehicles', to: '/admin/vehicles', icon: Truck, permission: 'shipment:read', hint: 'Fleet and drivers' },
  ] },
  { key: 'config', label: 'Configuration', items: [
    { key: 'programme', label: 'Programme settings', to: '/admin/programme', icon: Settings2, permission: 'config:manage', hint: 'Thresholds and norms' },
    { key: 'exchange', label: 'Data exchange', to: '/admin/data', icon: ArrowLeftRight, permission: 'data:import', hint: 'Bulk import and export' },
    { key: 'audit', label: 'Audit trail', to: '/admin/audit', icon: FileText, permission: 'audit:read', hint: 'Every change, who and when' },
  ] },
];
