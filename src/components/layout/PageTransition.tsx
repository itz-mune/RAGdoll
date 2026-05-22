import { motion } from 'framer-motion';

interface PageTransitionProps {
  children: React.ReactNode;
  /** Unique key — change this when navigating to a different page to trigger the animation */
  pageKey: string;
}

export function PageTransition({ children, pageKey }: PageTransitionProps) {
  return (
    <motion.div
      key={pageKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full flex-col"
    >
      {children}
    </motion.div>
  );
}
