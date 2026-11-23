import { AlertTriangle, BarChart3, Boxes, ChefHat, ClipboardCheck, ClipboardList, Gauge, Inbox, LayoutGrid, Route, ScanSearch, School, Settings2, ShieldCheck, ShoppingCart, Truck, Wheat } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Permission } from '@nt/domain';

export interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  permission: Permission;
}
export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

/** Grouped by the journey of food: plan → source → store → move → cook → serve → assure. */
export const NAV: NavGroup[] = [
  {
    key: 'home', label: 'nav.group.home', items: [
      { key: 'work', label: 'nav.work', to: '/work', icon: Inbox, permission: 'dashboard:read' },
      { key: 'overview', label: 'nav.overview', to: '/', icon: Gauge, permission: 'dashboard:read' },
      { key: 'exceptions', label: 'nav.exceptions', to: '/exceptions', icon: AlertTriangle, permission: 'exception:read' },
    ],
  },
  {
    key: 'supply', label: 'nav.group.supply', items: [
      { key: 'procurement', label: 'nav.procurement', to: '/procurement/orders', icon: ShoppingCart, permission: 'po:read' },
      { key: 'indents', label: 'nav.indents', to: '/indents', icon: ClipboardList, permission: 'indent:read' },
      { key: 'inventory', label: 'nav.inventory', to: '/inventory', icon: Boxes, permission: 'stock:read' },
      { key: 'logistics', label: 'nav.logistics', to: '/logistics/shipments', icon: Truck, permission: 'shipment:read' },
      { key: 'lastmile', label: 'nav.lastMile', to: '/last-mile', icon: Route, permission: 'trip:read' },
    ],
  },
  {
    key: 'meals', label: 'nav.group.meals', items: [
      { key: 'kitchen', label: 'nav.kitchen', to: '/kitchen', icon: ChefHat, permission: 'meal:read' },
      { key: 'schools', label: 'nav.schools', to: '/schools', icon: School, permission: 'meal:read' },
      { key: 'nutrition', label: 'nav.nutrition', to: '/nutrition', icon: Wheat, permission: 'meal:read' },
    ],
  },
  {
    key: 'assure', label: 'nav.group.assure', items: [
      { key: 'trace', label: 'nav.trace', to: '/trace', icon: ScanSearch, permission: 'trace:read' },
      { key: 'quality', label: 'nav.quality', to: '/quality/inspections', icon: ClipboardCheck, permission: 'quality:read' },
      { key: 'recalls', label: 'nav.recalls', to: '/quality/recalls', icon: ShieldCheck, permission: 'quality:read' },
      { key: 'reports', label: 'nav.reports', to: '/reports', icon: BarChart3, permission: 'report:export' },
    ],
  },
  {
    key: 'admin', label: 'nav.group.admin', items: [
      { key: 'suppliers', label: 'nav.suppliers', to: '/procurement/suppliers', icon: LayoutGrid, permission: 'supplier:manage' },
      { key: 'console', label: 'nav.console', to: '/admin', icon: Settings2, permission: 'admin:access' },
    ],
  },
];
