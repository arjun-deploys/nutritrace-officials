import { Suspense, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { LoadingBlock } from '@/components/shared/states';
import { registry } from '@/lib/api';
import { AppSidebar } from './app-sidebar';
import { CommandSearch } from './command-search';
import { ScopeSwitcher } from './scope-switcher';
import { ConnectivityIndicator, NotificationsMenu, UserMenu } from './topbar-menus';

/** `banner` lets the prototype inject its demo bar without forking the shell. */
export function AppShell({ banner }: { banner?: ReactNode }) {
  const tenant = useQuery(registry.tenant());
  return (
    <SidebarProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      <AppSidebar tenantName={tenant.data ? `${tenant.data.name}${tenant.data.isDemo ? ' (demo)' : ''}` : undefined} />
      <SidebarInset className="min-w-0">
        {banner}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur md:px-5">
          <SidebarTrigger className="-ml-1" />
          <ScopeSwitcher />
          <div className="ml-auto flex flex-1 items-center justify-end gap-1.5 md:gap-2">
            <div className="hidden flex-1 justify-end sm:flex"><CommandSearch /></div>
            <ConnectivityIndicator />
            <NotificationsMenu />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1">
          <Suspense fallback={<div className="p-8"><LoadingBlock rows={6} /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
