import { useEffect, useState } from 'react';
import { api, qs } from './api.js';
import { useFetch } from './hooks.js';

/** Paginated + filtered list with its own state. `path` e.g. '/signals', '/trading/history'. */
export function useRecords(path, baseParams = {}, { pageSize = 15, refreshKey = 0 } = {}) {
  const [filters, setFilters] = useState({}); const [page, setPage] = useState(1);
  const params = { ...baseParams, ...filters, page, pageSize };
  const key = JSON.stringify(params);
  const f = useFetch(() => api(`${path}${qs(params)}`), [path, key, refreshKey]);
  useEffect(() => { setPage(1); }, [JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (p) => setFilters((cur) => { const n = { ...cur, ...p }; Object.keys(n).forEach((k) => (n[k] === '' || n[k] == null) && delete n[k]); return n; });
  const exportQuery = qs({ ...baseParams, ...filters });
  return { ...f, rows: f.data?.rows, page, setPage, pages: f.data?.pages || 1, total: f.data?.total || 0, pageSize, filters, patch, reset: () => setFilters({}), exportQuery, columns: f.data?.columns };
}
