import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useDebounced } from '../lib/hooks.js';

/** values: object, onChange(patch). fields: [{ key, type: 'search'|'select'|'date', label, options?: [[value,label]] }] */
export default function FilterBar({ fields, values, onChange, onReset }) {
  const searchField = fields.find((f) => f.type === 'search');
  const [text, setText] = useState(values[searchField?.key] || '');
  const deb = useDebounced(text, 300);
  useEffect(() => { if (searchField && deb !== (values[searchField.key] || '')) onChange({ [searchField.key]: deb }); }, [deb]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (searchField && !values[searchField.key]) setText(''); }, [values, searchField]);
  const dirty = fields.some((f) => values[f.key]);
  return (
    <div className="flex flex-wrap items-end gap-2.5 p-3 border-b border-line">
      {fields.map((f) => f.type === 'search' ? (
        <div key={f.key} className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input className="input !pl-8 !h-9" placeholder={f.label} value={text} onChange={(e) => setText(e.target.value)} aria-label={f.label} type="search" />
        </div>
      ) : f.type === 'select' ? (
        <select key={f.key} className="input !h-9 !w-auto min-w-[130px]" value={values[f.key] || ''} onChange={(e) => onChange({ [f.key]: e.target.value })} aria-label={f.label}>
          <option value="">{f.label}</option>
          {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : (
        <label key={f.key} className="flex items-center gap-1.5 text-xs text-mute">{f.label}<input type="date" className="input !h-9 !w-[136px]" value={values[f.key] || ''} onChange={(e) => onChange({ [f.key]: e.target.value })} aria-label={f.label} /></label>
      ))}
      {dirty && <button className="btn btn-ghost btn-sm" onClick={() => { setText(''); onReset(); }}><X size={13} />Clear</button>}
    </div>
  );
}
