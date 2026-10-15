import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { EmptyState, ErrorState, Pagination, Skeleton } from './ui.jsx';

/** Generic table (TanStack Table) with loading skeleton, empty/error states and server pagination. */
export default function DataTable({ columns, data, loading, error, onRetry, emptyTitle, emptyHint, page, pages, total, pageSize, onPage, onRowClick, minWidth }) {
  const table = useReactTable({ data: data || [], columns, getCoreRowModel: getCoreRowModel() });
  if (error && !data?.length) return <ErrorState message={error} onRetry={onRetry} />;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="tbl" style={minWidth ? { minWidth } : undefined}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} className={h.column.columnDef.meta?.right ? 'r' : ''}>{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>
            ))}
          </thead>
          <tbody>
            {loading && !data?.length
              ? Array.from({ length: 6 }).map((_, i) => <tr key={i}>{columns.map((c, j) => <td key={j}><Skeleton className="h-4 w-full max-w-[110px]" /></td>)}</tr>)
              : table.getRowModel().rows.map((row) => (
                <tr key={row.id} onClick={onRowClick ? () => onRowClick(row.original) : undefined} className={onRowClick ? 'cursor-pointer' : ''}>
                  {row.getVisibleCells().map((cell) => <td key={cell.id} className={cell.column.columnDef.meta?.right ? 'r' : ''}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!loading && !data?.length && <EmptyState title={emptyTitle} hint={emptyHint} />}
      {onPage && <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPage={onPage} />}
    </>
  );
}
