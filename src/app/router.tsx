import type { ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import type { Permission } from '@nt/domain';
import { AppShell } from './layouts/app-shell';
import { AdminShell } from '@/admin/admin-shell';
import { RequireAuth, RequirePermission } from './guards';
import { NotFound, RouteError } from '@/features/system/pages';

type Loader = () => Promise<{ default: React.ComponentType } | Record<string, unknown>>;

/** Lazy route with a permission gate. Each feature ships as its own chunk. */
const page = (path: string, permission: Permission, load: Loader, name = 'default'): RouteObject => ({
  path,
  lazy: async () => {
    const mod = (await load()) as Record<string, React.ComponentType>;
    const Component = mod[name]!;
    return { Component: () => <RequirePermission permission={permission}><Component /></RequirePermission> };
  },
});

export interface RouterOptions {
  /** Prototype injects its demo bar and sign-in helper through these. */
  banner?: ReactNode;
  loginAside?: ReactNode;
  extraRoutes?: RouteObject[];
}

export function createAppRouter(opts: RouterOptions = {}) {
  return createBrowserRouter([
    {
      path: '/login',
      errorElement: <RouteError />,
      lazy: async () => {
        const { default: Login } = await import('@/features/auth/login');
        return { Component: () => <Login aside={opts.loginAside} /> };
      },
    },
    {
      path: '/home',
      errorElement: <RouteError />,
      lazy: async () => ({ Component: (await import('@/features/public/landing-page')).default }),
    },
    {
      path: '/t/:code',
      errorElement: <RouteError />,
      lazy: async () => ({ Component: (await import('@/features/public/public-lot-page')).default }),
    },
    ...(opts.extraRoutes ?? []),
    {
      element: <RequireAuth />,
      errorElement: <RouteError />,
      children: [
        {
          element: <AppShell banner={opts.banner} />,
          errorElement: <RouteError />,
          children: [
            page('/', 'dashboard:read', () => import('@/features/dashboard/overview-page')),
            page('/work', 'dashboard:read', () => import('@/features/work/my-work-page')),
            page('/indents', 'indent:read', () => import('@/features/indents/indents-page')),
            page('/indents/new', 'indent:create', () => import('@/features/indents/indent-new-page')),
            page('/indents/:id', 'indent:read', () => import('@/features/indents/indent-detail-page')),
            page('/last-mile', 'trip:read', () => import('@/features/last-mile/last-mile-page')),
            page('/last-mile/trips/:id', 'trip:read', () => import('@/features/last-mile/trip-page')),
            page('/trace', 'trace:read', () => import('@/features/trace/trace-page')),
            page('/trace/lots/:id', 'trace:read', () => import('@/features/trace/lot-page')),
            page('/exceptions', 'exception:read', () => import('@/features/exceptions/exceptions-page')),
            page('/procurement/orders', 'po:read', () => import('@/features/procurement/orders-page')),
            page('/procurement/orders/new', 'po:create', () => import('@/features/procurement/order-new-page')),
            page('/procurement/orders/:id', 'po:read', () => import('@/features/procurement/order-detail-page')),
            page('/procurement/suppliers', 'po:read', () => import('@/features/procurement/suppliers-page')),
            page('/procurement/suppliers/:id', 'po:read', () => import('@/features/procurement/suppliers-page'), 'SupplierDetailPage'),
            page('/inventory', 'stock:read', () => import('@/features/inventory/inventory-page')),
            page('/logistics/shipments', 'shipment:read', () => import('@/features/logistics/shipments-page')),
            page('/logistics/shipments/new', 'shipment:create', () => import('@/features/logistics/shipment-new-page')),
            page('/logistics/shipments/:id', 'shipment:read', () => import('@/features/logistics/shipment-detail-page')),
            page('/logistics/shipments/:id/receive', 'shipment:receive', () => import('@/features/logistics/receive-page')),
            page('/kitchen', 'meal:read', () => import('@/features/kitchen/kitchen-page')),
            page('/schools', 'meal:read', () => import('@/features/schools/schools-page')),
            page('/schools/:id', 'meal:read', () => import('@/features/schools/school-page')),
            page('/nutrition', 'meal:read', () => import('@/features/nutrition/nutrition-page')),
            page('/quality/inspections', 'quality:read', () => import('@/features/quality/inspections-page')),
            page('/quality/recalls', 'quality:read', () => import('@/features/quality/recalls-page')),
            page('/quality/recalls/:id', 'quality:read', () => import('@/features/quality/recalls-page'), 'RecallDetailPage'),
            page('/reports', 'report:export', () => import('@/features/reports/reports-page')),
            page('/account', 'dashboard:read', () => import('@/features/account/account-page')),
            { path: '*', Component: NotFound },
          ],
        },
        {
          // Admin Console: a separate portal with its own shell and navigation.
          path: '/admin',
          element: <RequirePermission permission="admin:access"><AdminShell banner={opts.banner} /></RequirePermission>,
          errorElement: <RouteError />,
          children: [
            page('', 'admin:access', () => import('@/admin/pages/overview-page')),
            page('users', 'user:manage', () => import('@/features/admin/users-page')),
            page('roles', 'config:manage', () => import('@/admin/pages/roles-page')),
            page('locations', 'master:read', () => import('@/features/admin/locations-page')),
            page('facilities', 'master:read', () => import('@/features/admin/facilities-page')),
            page('products', 'master:read', () => import('@/features/admin/commodities-page')),
            page('suppliers', 'po:read', () => import('@/features/procurement/suppliers-page')),
            page('suppliers/:id', 'po:read', () => import('@/features/procurement/suppliers-page'), 'SupplierDetailPage'),
            page('vehicles', 'shipment:read', () => import('@/features/admin/vehicles-page')),
            page('programme', 'config:manage', () => import('@/features/admin/programme-page')),
            page('data', 'data:import', () => import('@/admin/pages/data-exchange-page')),
            page('audit', 'audit:read', () => import('@/features/admin/audit-page')),
            { path: '*', Component: NotFound },
          ],
        },
      ],
    },
  ]);
}
