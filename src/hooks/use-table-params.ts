import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export interface TableParams {
  page: number;
  pageSize: number;
  q?: string;
  sort?: string;
  order: 'asc' | 'desc';
  [filter: string]: string | number | undefined;
}

/** Table state lives in the URL so filtered views can be bookmarked and shared. */
export function useTableParams(defaults: Partial<TableParams> = {}) {
  const [sp, setSp] = useSearchParams();
  const params = useMemo(() => {
    const out: TableParams = { page: 1, pageSize: 25, order: 'desc', ...defaults } as TableParams;
    sp.forEach((v, k) => {
      out[k] = k === 'page' || k === 'pageSize' ? Number(v) : v;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  const setParam = useCallback(
    (key: string, value: string | number | undefined) =>
      setSp((prev) => {
        const next = new URLSearchParams(prev);
        if (value === undefined || value === '' || value === 'all') next.delete(key);
        else next.set(key, String(value));
        if (key !== 'page') next.delete('page');
        return next;
      }, { replace: true }),
    [setSp],
  );
  return { params, setParam };
}
