import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CloudOff, Cloud, LogOut, Moon, RefreshCw, Languages, UserRound, Settings2 } from 'lucide-react';
import { ROLE_LABELS } from '@nt/domain';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { LANGUAGES } from '@/i18n';
import { identity, insight } from '@/lib/api';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useOfflineQueue } from '@/stores/offline-queue';
import { useUiStore } from '@/stores/ui';
import { toast } from 'sonner';

export function ConnectivityIndicator() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(navigator.onLine);
  const { items, flush, flushing } = useOfflineQueue();
  useEffect(() => {
    const up = () => { setOnline(true); void flush().then((r) => r.sent && toast.success(`${r.sent} saved ${r.sent === 1 ? 'entry' : 'entries'} sent`)); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [flush]);
  if (online && !items.length) return null;
  return (
    <Button variant="ghost" size="sm" onClick={() => void flush()} className={cn(online ? 'text-warning' : 'text-danger')} title={online ? t('shell.pending', { count: items.length }) : t('shell.offline')}>
      {online ? <Cloud /> : <CloudOff />}
      <span className="hidden lg:inline">{online ? t('shell.pending', { count: items.length }) : t('shell.offline').split('—')[0]}</span>
      {online && <RefreshCw className={cn(flushing && 'animate-spin')} />}
    </Button>
  );
}

export function NotificationsMenu() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data = [] } = useQuery(insight.notifications());
  const unread = data.filter((n) => !n.read);
  const mark = useMutation({ mutationFn: insight.markRead, onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }), meta: { silent: true } });
  return (
    <Popover onOpenChange={(o) => !o && unread.length && mark.mutate(unread.map((n) => n.id))}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${t('shell.notifications')}${unread.length ? ` (${unread.length} unread)` : ''}`}>
          <Bell />
          {unread.length > 0 && <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white num">{unread.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <p className="border-b px-4 py-2.5 text-sm font-semibold">{t('shell.notifications')}</p>
        <ul className="max-h-96 overflow-y-auto">
          {data.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{t('shell.allCaughtUp')}</li>}
          {data.map((n) => (
            <li key={n.id} className={cn('border-b last:border-0', !n.read && 'bg-trace-soft/40')}>
              <Link to={n.link ?? '/exceptions'} className="block px-4 py-3 hover:bg-accent">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{ago(n.createdAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function UserMenu() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user!);
  const clear = useAuthStore((s) => s.clear);
  const { theme, setTheme, language, setLanguage } = useUiStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const initials = user.name.split(' ').map((p) => p.replace(/[^\p{L}]/gu, '')[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const signOut = async () => {
    await identity.logout().catch(() => undefined);
    clear();
    qc.clear();
    navigate('/login', { replace: true });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Account menu">
          <Avatar className="size-7"><AvatarFallback className="bg-primary text-xs text-primary-foreground">{initials}</AvatarFallback></Avatar>
          <span className="hidden max-w-36 truncate text-sm lg:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium">{user.name}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          <p className="mt-1 text-xs text-muted-foreground">{user.scopeLabel}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/account')}><UserRound /> {t('shell.account')}</DropdownMenuItem>
        {user.permissions.includes('admin:access') && <DropdownMenuItem onSelect={() => navigate('/admin')}><Settings2 /> {t('nav.console')}</DropdownMenuItem>}
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTheme(theme === 'dark' ? 'light' : 'dark'); }}>
          <Moon /> {t('shell.theme')}
          <Switch className="ml-auto" checked={theme === 'dark'} aria-hidden tabIndex={-1} />
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Languages /> {t('shell.language')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={language} onValueChange={(l) => { setLanguage(l); void i18n.changeLanguage(l); document.documentElement.lang = l; }}>
              {LANGUAGES.map((l) => <DropdownMenuRadioItem key={l.code} value={l.code}>{l.label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}><LogOut /> {t('shell.signOut')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
