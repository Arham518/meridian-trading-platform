import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { download } from '../lib/api.js';
import { Spinner } from './ui.jsx';

export default function ExcelButton({ path, label = 'Download Excel', small = true, ghost = true }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const name = await download(path); toast.success(`Downloaded ${name}`); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  return (
    <button className={`btn ${ghost ? 'btn-ghost' : 'btn-primary'} ${small ? 'btn-sm' : ''}`} onClick={go} disabled={busy} title="Export to .xlsx">
      {busy ? <Spinner /> : <FileSpreadsheet size={15} className="text-mute" />}{label}
    </button>
  );
}
