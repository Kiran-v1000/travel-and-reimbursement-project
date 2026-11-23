import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { UploadCloud, FileText, Image as ImageIcon, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { api, del, fileUrl } from '../lib/api.js';
import { bytes } from '../utils/format.js';
import { Spinner } from './ui/primitives.jsx';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Drag & drop (or click / paste) receipt uploader with progress, plus the attached file list. */
export function FileDrop({ target, files = [], editable, onChange, compact }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(null);

  async function upload(list) {
    const chosen = [...list].filter((f) => ACCEPT.includes(f.type));
    if (!chosen.length) return toast.error('Only JPG, PNG, WEBP or PDF files are supported');
    const form = new FormData();
    chosen.forEach((f) => form.append('files', f));
    Object.entries(target).forEach(([k, v]) => form.append(k, v));
    setProgress(0);
    try {
      await api.post('/attachments', form, { onUploadProgress: (e) => setProgress(Math.round((e.loaded / (e.total || 1)) * 100)) });
      toast.success(chosen.length > 1 ? `${chosen.length} files attached` : 'Receipt attached');
      onChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(id) {
    try {
      await del(`/attachments/${id}`);
      onChange?.();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {files.map((f) => (
          <motion.div
            key={f.id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
              {f.mimeType?.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium">{f.originalName}</p>
              <p className="text-[11px] text-muted">{bytes(f.size)}</p>
            </div>
            <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="btn-ghost h-8 w-8 px-0" aria-label={`Open ${f.originalName}`}>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {editable && (
              <button type="button" onClick={() => remove(f.id)} className="btn-ghost h-8 w-8 px-0 hover:text-bad" aria-label={`Remove ${f.originalName}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {editable && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          onPaste={(e) => e.clipboardData.files.length && upload(e.clipboardData.files)}
          className={clsx(
            'relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-all duration-200',
            compact ? 'px-3 py-3' : 'px-4 py-6',
            drag ? 'scale-[1.01] border-brand bg-brand/5' : 'border-line hover:border-brand/50 hover:bg-subtle/60',
          )}
        >
          {progress != null ? (
            <div className="flex w-full max-w-xs flex-col items-center gap-2">
              <Spinner className="text-brand" />
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
                <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <>
              <UploadCloud className={clsx('text-brand transition-transform', compact ? 'h-5 w-5' : 'h-7 w-7', drag && '-translate-y-1')} />
              <p className="mt-1.5 text-[12.5px] font-medium">
                {compact ? 'Add receipt' : 'Drop receipts here, paste, or '}
                {!compact && <span className="text-brand">browse</span>}
              </p>
              {!compact && <p className="text-[11.5px] text-muted">JPG, PNG, WEBP or PDF · up to 10 MB</p>}
            </>
          )}
          <input ref={input} type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
        </div>
      )}
    </div>
  );
}
