/**
 * ImageLightbox — full-screen image viewer, opened when a chat-bubble
 * image thumbnail is clicked. Closes on backdrop click or Escape key.
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="relative flex flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 rounded-full bg-white/10 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          aria-label="Close image"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Image */}
        <img
          src={src}
          alt={alt}
          className="max-h-[85vh] max-w-[88vw] rounded-xl object-contain shadow-2xl ring-1 ring-white/10"
          draggable={false}
        />

        {/* Caption */}
        {alt && (
          <p className="max-w-[88vw] truncate text-center text-sm text-white/60">{alt}</p>
        )}
      </motion.div>
    </motion.div>
  );
}
