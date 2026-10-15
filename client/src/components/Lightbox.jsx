import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function Lightbox({ src, title, onClose }) {
  useEffect(() => { if (!src) return undefined; const k = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [src, onClose]);
  return (
    <AnimatePresence>
      {src && (
        <motion.div className="fixed inset-0 z-[90] grid place-items-center p-4 bg-black/80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
          <button className="absolute top-4 right-4 btn btn-ghost btn-icon" onClick={onClose} aria-label="Close image"><X size={18} /></button>
          <motion.img initial={{ scale: 0.96 }} animate={{ scale: 1 }} src={src} alt={title} className="max-h-[88dvh] max-w-full rounded-md border border-line object-contain" onClick={(e) => e.stopPropagation()} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
