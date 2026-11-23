import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import i18n from '@/i18n';
import { queryClient } from '@/lib/query-client';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';

const Devtools = import.meta.env.DEV ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools }))) : () => null;

/** Clear cached data when the signed-in user changes so nothing leaks between accounts on a shared device. */
function SessionWatcher() {
  const userId = useAuthStore((s) => s.user?.id);
  const previous = useRef(userId);
  useEffect(() => {
    if (previous.current === userId) return;
    previous.current = userId;
    queryClient.removeQueries({ type: 'inactive' });
    void queryClient.resetQueries({ type: 'active' });
  }, [userId]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const { theme, language } = useUiStore();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [language]);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <SessionWatcher />
        {children}
        <Toaster />
      </TooltipProvider>
      <Suspense fallback={null}><Devtools buttonPosition="bottom-left" /></Suspense>
    </QueryClientProvider>
  );
}
