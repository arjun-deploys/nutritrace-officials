import { Suspense, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { can } from '@nt/domain';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { LoadingBlock } from '@/components/shared/states';
import { BrandMark } from '@/app/layouts/app-sidebar';
import { UserMenu, NotificationsMenu } from '@/app/layouts/topbar-menus';
import { registry } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { ADMIN_NAV } from './admin-nav';

/**
 * The Admin Console: a separate portal for configuring the platform —
 * people, roles, structure, catalogue and data exchange. Operations never happen here.
 */
export function AdminShell({ banner }: { banner?: ReactNode }) {
  const perms = useAuthStore((s) => s.user?.permissions);
  const tenant = useQuery(registry.tenant());
  const { pathname } = useLocation();
  const active = (to: string) => (to === '/admin' ? pathname === '/admin' : pathname.startsWith(to));
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="[--sidebar:#1b2430] [--sidebar-accent:#263243] [--sidebar-border:#2c3a4d]">
        <SidebarHeader className="px-3 pt-4 pb-3">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <BrandMark className="size-8 shrink-0" />
            <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <p className="font-semibold text-white">Admin Console</p>
              <p className="truncate text-xs text-sidebar-foreground/70">{tenant.data?.name ?? 'NutriTrace'}</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {ADMIN_NAV.map((g) => {
            const items = g.items.filter((i) => can(perms, i.permission));
            if (!items.length) return null;
            return (
              <SidebarGroup key={g.key}>
                <SidebarGroupLabel className="text-sidebar-foreground/55">{g.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {items.map((i) => (
                    <SidebarMenuItem key={i.key}>
                      <SidebarMenuButton asChild isActive={active(i.to)} tooltip={i.label} className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-white data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)]">
                        <NavLink to={i.to} end={i.to === '/admin'}><i.icon aria-hidden /><span>{i.label}</span></NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            );
          })}
        </SidebarContent>
        <SidebarFooter className="px-3 pb-4">
          {can(perms, 'dashboard:read') && (
            <SidebarMenuButton asChild tooltip="Operations portal"><Link to="/"><ArrowLeft aria-hidden /><span>Operations portal</span></Link></SidebarMenuButton>
          )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        {banner}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-[#f1f3f6] px-3 md:px-5 dark:bg-background">
          <SidebarTrigger className="-ml-1" />
          <span className="rounded bg-[#1b2430] px-2 py-0.5 text-xs font-medium text-white">ADMIN</span>
          <span className="hidden truncate text-sm text-muted-foreground md:inline">Changes here apply to everyone in your area and are recorded in the audit trail.</span>
          <div className="ml-auto flex items-center gap-1.5"><NotificationsMenu /><UserMenu /></div>
        </header>
        <main id="main" className="min-w-0 flex-1">
          <Suspense fallback={<div className="p-8"><LoadingBlock rows={6} /></div>}><Outlet /></Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
