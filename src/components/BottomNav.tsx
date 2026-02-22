"use client";

import { motion } from "framer-motion";

const ACTIVE_COLOR = "#2563eb"; // Claridad blue
const ICON_SIZE = 20;

const icons = {
  home: (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  metricas: (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  historial: (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
} as const;

const items: { id: keyof typeof icons; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "metricas", label: "Métricas" },
  { id: "historial", label: "Historial" },
];

export type BottomNavId = keyof typeof icons;

type Props = {
  activeId: BottomNavId;
  onSelect: (id: BottomNavId) => void;
  showProBadge?: boolean;
};

export function BottomNav({ activeId, onSelect, showProBadge = false }: Props) {
  return (
    <nav
      className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 w-full max-w-[320px] rounded-3xl border border-zinc-800 bg-zinc-900 px-5 py-2 shadow-lg shadow-black/30"
      aria-label="Navegación principal"
    >
      {showProBadge && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
          Pro
        </div>
      )}
      <ul className="flex items-center justify-around">
        {items.map(({ id, label }) => {
          const isActive = activeId === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                className="relative flex flex-col items-center gap-0.5 rounded-full py-1.5 px-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
              >
                <motion.span
                  className="relative flex h-8 w-8 items-center justify-center rounded-full text-zinc-500"
                  style={{ color: isActive ? ACTIVE_COLOR : undefined }}
                  animate={{ scale: isActive ? 1.05 : 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  {isActive && (
                    <span
                      className="absolute inset-0 rounded-full opacity-20"
                      style={{ backgroundColor: ACTIVE_COLOR }}
                    />
                  )}
                  <span className="relative">{icons[id]}</span>
                </motion.span>
                <span
                  className={`text-[10px] font-medium uppercase tracking-wider ${
                    isActive ? "" : "text-zinc-500"
                  }`}
                  style={isActive ? { color: ACTIVE_COLOR } : undefined}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
