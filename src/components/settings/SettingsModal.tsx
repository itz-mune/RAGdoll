import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { SettingsPanel } from './SettingsPanel';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
          >
            <div className="relative max-h-[90vh] overflow-y-auto">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground shadow transition-colors hover:bg-muted/80 hover:text-foreground"
                aria-label="Close settings"
              >
                <X className="h-3.5 w-3.5" />
              </button>

              <SettingsPanel onSave={onClose} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
