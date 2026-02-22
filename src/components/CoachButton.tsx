"use client";

import { motion } from "framer-motion";

type CoachButtonProps = {
  isPro: boolean;
  onClick: () => void;
};

const LockIcon = () => (
  <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

export function CoachButton({ isPro, onClick }: CoachButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="fixed bottom-24 right-4 z-30 flex items-center gap-2 rounded-2xl border border-zinc-700/80 bg-zinc-900/95 px-4 py-2.5 shadow-xl backdrop-blur-sm sm:right-6 sm:bottom-28"
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: [0, -4, 0],
      }}
      transition={{
        opacity: { duration: 0.3 },
        y: { repeat: Infinity, duration: 2.5, ease: "easeInOut" },
      }}
      whileTap={{ scale: 0.97 }}
      aria-label="Abrir Coach IA"
    >
      <span className={`text-sm font-medium ${isPro ? "text-emerald-400/90" : "text-zinc-400"}`}>
        Coach IA
      </span>
      {!isPro && (
        <span className="flex items-center gap-1 text-xs text-zinc-500">
          <LockIcon />
          <span>(Pro)</span>
        </span>
      )}
    </motion.button>
  );
}
