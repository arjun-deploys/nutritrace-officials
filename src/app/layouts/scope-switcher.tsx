import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { registry } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

/**
 * Narrow the view to a district or block inside the officer's own scope.
 * The server re-checks every request, so this is a lens, not a permission.
 */
export function ScopeSwitcher() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user!);
  const { geoPath, setGeoPath } = useUiStore();
  const units = useQuery(registry.geoUnits());
  if (user.facilityId) {
    return <p className="hidden items-center gap-1.5 truncate text-sm text-muted-foreground md:flex"><MapPin className="size-4" />{user.facilityName ?? user.scopeLabel}</p>;
  }
  const base = user.geoPath;
  const current = geoPath && geoPath.startsWith(base) ? geoPath : base;
  const depth = base.split('/').length;
  const children = (units.data ?? []).filter((u) => u.geoPath.startsWith(`${base}/`) && u.geoPath.split('/').length === depth + 1);
  const selectedChild = current.split('/').slice(0, depth + 1).join('/');
  const grandchildren = current !== base ? (units.data ?? []).filter((u) => u.geoPath.startsWith(`${selectedChild}/`) && u.geoPath.split('/').length === depth + 2) : [];
  const baseName = units.data?.find((u) => u.geoPath === base)?.name ?? user.scopeLabel;
  return (
    <div className="flex items-center gap-2">
      <MapPin className="hidden size-4 text-muted-foreground md:block" aria-hidden />
      <Select value={current === base ? '__all' : selectedChild} onValueChange={(v) => setGeoPath(v === '__all' ? null : v)}>
        <SelectTrigger size="sm" className="max-w-64 border-transparent bg-transparent shadow-none hover:bg-accent" aria-label={t('shell.scope')}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">{depth === 1 ? `${baseName} — ${t('shell.wholeState').toLowerCase()}` : baseName}</SelectItem>
          {children.map((c) => <SelectItem key={c.id} value={c.geoPath}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {grandchildren.length > 0 && (
        <>
          <span className="text-muted-foreground" aria-hidden>/</span>
          <Select value={current.split('/').length > depth + 1 ? current : '__all'} onValueChange={(v) => setGeoPath(v === '__all' ? selectedChild : v)}>
            <SelectTrigger size="sm" className="max-w-44 border-transparent bg-transparent shadow-none hover:bg-accent" aria-label="Block"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All {grandchildren[0]?.levelName.toLowerCase()}s</SelectItem>
              {grandchildren.map((c) => <SelectItem key={c.id} value={c.geoPath}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  );
}

/** The geo path pages should query with. */
export function useScopePath() {
  const base = useAuthStore((s) => s.user?.geoPath ?? '');
  const geoPath = useUiStore((s) => s.geoPath);
  return geoPath && geoPath.startsWith(base) ? geoPath : base;
}
