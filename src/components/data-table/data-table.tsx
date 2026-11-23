import { useEffect, useState, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import type { UseQueryResult } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { useDebounced } from '@/hooks/use-debounced';
import type { TableParams } from '@/hooks/use-table-params';
import type { PageResult } from '@/lib/api';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    sortKey?: string;
    align?: 'right' | 'center';
    className?: string;
  }
}

export interface TableFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface Props<T> {
  columns: ColumnDef<T, unknown>[];
  /** Server-paginated query … */
  query?: UseQueryResult<PageResult<T>>;
  /** … or a plain array rendered client-side. */
  rows?: T[];
  loading?: boolean;
  params?: TableParams;
  setParam?: (key: string, value: string | number | undefined) => void;
  searchPlaceholder?: string;
  filters?: TableFilter[];
  toolbar?: ReactNode;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  empty?: { title: string; description?: string; action?: ReactNode };
  rowClassName?: (row: T) => string | undefined;
  dense?: boolean;
}

export function DataTable<T>({ columns, query, rows, loading, params, setParam, searchPlaceholder, filters, toolbar, onRowClick, getRowId, empty, rowClassName, dense }: Props<T>) {
  const [search, setSearch] = useState(params?.q ?? '');
  const debounced = useDebounced(search);
  useEffect(() => {
    if (setParam && debounced !== (params?.q ?? '')) setParam('q', debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const data = rows ?? query?.data?.data ?? [];
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel(), getRowId: getRowId ? (r) => getRowId(r) : undefined, manualPagination: true, manualSorting: true });
  const meta = query?.data?.meta;
  const isLoading = loading ?? (query ? query.isPending : false);
  const showToolbar = !!(setParam && (searchPlaceholder || filters?.length)) || !!toolbar;

  const toggleSort = (key: string) => {
    if (!setParam || !params) return;
    if (params.sort !== key) {
      setParam('sort', key);
      setParam('order', 'desc');
    } else setParam('order', params.order === 'desc' ? 'asc' : 'desc');
  };

  return (
    <div className="space-y-3">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchPlaceholder && setParam && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} className="pl-8" aria-label={searchPlaceholder} />
            </div>
          )}
          {filters?.map((f) => (
            <Select key={f.key} value={String(params?.[f.key] ?? 'all')} onValueChange={(v) => setParam?.(f.key, v)}>
              <SelectTrigger className="w-auto min-w-40" aria-label={f.label}>
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {f.label.toLowerCase()}</SelectItem>
                {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}
          {toolbar && <div className="ml-auto flex items-center gap-2">{toolbar}</div>}
        </div>
      )}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((h) => {
                    const m = h.column.columnDef.meta;
                    const sorted = m?.sortKey && params?.sort === m.sortKey ? params.order : undefined;
                    return (
                      <TableHead key={h.id} className={cn('h-10 text-xs font-medium text-muted-foreground', m?.align === 'right' && 'text-right', m?.className)} aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}>
                        {m?.sortKey && setParam ? (
                          <button type="button" onClick={() => toggleSort(m.sortKey!)} className={cn('inline-flex items-center gap-1 hover:text-foreground', m.align === 'right' && 'flex-row-reverse')}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {sorted === 'asc' ? <ArrowUp className="size-3" /> : sorted === 'desc' ? <ArrowDown className="size-3" /> : null}
                          </button>
                        ) : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((_c, j) => <TableCell key={j}><Skeleton className="h-4 w-full max-w-40" /></TableCell>)}
                  </TableRow>
                ))
              ) : query?.error && !rows ? (
                <TableRow><TableCell colSpan={columns.length}><ErrorState error={query.error} onRetry={() => query.refetch()} /></TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow className="hover:bg-transparent"><TableCell colSpan={columns.length}><EmptyState title={empty?.title ?? 'Nothing here yet'} description={empty?.description} action={empty?.action} /></TableCell></TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row.original) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const m = cell.column.columnDef.meta;
                      return (
                        <TableCell key={cell.id} className={cn(dense ? 'py-1.5' : 'py-2.5', m?.align === 'right' && 'text-right num', m?.className)}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {meta && setParam && meta.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-sm text-muted-foreground">
            <p className="num">
              Showing {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total.toLocaleString('en-IN')}
              {query?.isFetching && !query.isPending && <span className="ml-2 text-xs">Updating…</span>}
            </p>
            <div className="flex items-center gap-2">
              <Select value={String(meta.pageSize)} onValueChange={(v) => setParam('pageSize', v)}>
                <SelectTrigger size="sm" className="w-auto" aria-label="Rows per page"><SelectValue /></SelectTrigger>
                <SelectContent>{[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} rows</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" size="icon-sm" disabled={meta.page <= 1} onClick={() => setParam('page', meta.page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
              <Button variant="outline" size="icon-sm" disabled={meta.page * meta.pageSize >= meta.total} onClick={() => setParam('page', meta.page + 1)} aria-label="Next page"><ChevronRight /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
