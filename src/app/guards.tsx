import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { can, type Permission } from '@nt/domain';
import { restoreSession } from '@/lib/http';
import { useAuthStore } from '@/stores/auth';
import { Forbidden } from '@/features/system/pages';

function Splash() {
  return (
    <div className="grid min-h-svh place-items-center" aria-busy aria-label="Signing you in">
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>
    </div>
  );
}

/** On first load, try to resume the session from the refresh cookie before deciding. */
export function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const clear = useAuthStore((s) => s.clear);
  const mustChange = useAuthStore((s) => !!s.user?.mustChangePassword);
  const location = useLocation();
  useEffect(() => {
    if (status === 'unknown') void restoreSession().then((ok) => !ok && clear());
  }, [status, clear]);
  if (status === 'unknown') return <Splash />;
  // Visitors to the front door see the landing page; deep links go straight to sign-in.
  if (status === 'anonymous') return location.pathname === '/' ? <Navigate to="/home" replace /> : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  // A temporary password must be replaced before anything else.
  if (mustChange && location.pathname !== '/account') return <Navigate to="/account" replace />;
  return <Outlet />;
}

export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const perms = useAuthStore((s) => s.user?.permissions);
  return can(perms, permission) ? <>{children}</> : <Forbidden />;
}
