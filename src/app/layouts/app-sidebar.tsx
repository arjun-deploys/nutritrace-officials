import { NavLink, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { can } from '@nt/domain';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from '@/components/ui/sidebar';
import { NAV } from '@/config/nav';
import { useAuthStore } from '@/stores/auth';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="currentColor" className="text-primary" />
      <path d="M8 22c0-7 5-12 14-13-1 9-6 14-13 14" fill="#f5f7f6" />
      <circle cx="22.5" cy="9.5" r="2.5" fill="#d99a1e" />
    </svg>
  );
}

export function AppSidebar({ tenantName }: { tenantName?: string }) {
  const { t } = useTranslation();
  const perms = useAuthStore((s) => s.user?.permissions);
  const { pathname } = useLocation();
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pt-4 pb-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <BrandMark className="size-8 shrink-0" />
          <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <p className="font-semibold text-white">NutriTrace</p>
            <p className="truncate text-xs text-sidebar-foreground/70">{tenantName ?? 'School nutrition'}</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(perms, i.permission));
          if (!items.length) return null;
          return (
            <SidebarGroup key={g.key}>
              <SidebarGroupLabel className="text-sidebar-foreground/55">{t(g.label)}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((i) => (
                  <SidebarMenuItem key={i.key}>
                    <SidebarMenuButton asChild isActive={isActive(i.to)} tooltip={t(i.label)}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-white data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)]">
                      <NavLink to={i.to} end={i.to === '/'}>
                        <i.icon aria-hidden />
                        <span>{t(i.label)}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="px-4 pb-4 text-[11px] leading-snug text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
        Powered by StaTwig
      </SidebarFooter>
    </Sidebar>
  );
}
