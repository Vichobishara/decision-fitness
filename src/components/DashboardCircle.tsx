"use client";

import { motion } from "framer-motion";

const STROKE_WIDTH = 12;
const TRANSITION = { duration: 0.8, ease: "easeInOut" as const };

function strokeColor(score: number | null): string {
  if (score === null) return "#71717a";
  if (score < 45) return "#ef4444";
  if (score < 70) return "#f59e0b";
  return "#10b981";
}

function circleGeometry(size: number) {
  const r = (size - STROKE_WIDTH) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  return { r, cx, cy, circumference };
}

type Props = {
  score: number | null;
  size: 160 | 110;
  label: string;
  sublabel: string;
  emptyState?: boolean;
  onClick?: () => void;
};

export function DashboardCircle({
  score,
  size,
  label,
  sublabel,
  emptyState = false,
  onClick,
}: Props) {
  const { r, cx, cy, circumference } = circleGeometry(size);
  const color = strokeColor(score);
  const strokeDashoffset =
    emptyState || score === null
      ? circumference
      : circumference * (1 - score / 100);

  const content = (
    <motion.div
      className="flex flex-col items-center"
      whileHover={onClick ? { scale: 1.02 } : undefined}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="relative flex cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:ring-offset-2 focus:ring-offset-[#0F0F12] disabled:cursor-default"
        style={{ width: size, height: size }}
        aria-label={
          score !== null && !emptyState
            ? `${label}: ${score}`
            : `${label} — ${emptyState ? "próximamente" : "sin datos"}`
        }
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className={`overflow-visible ${score !== null && !emptyState ? "drop-shadow-[0_0_6px_rgba(0,0,0,0.4)]" : ""}`}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#27272a"
            strokeWidth={STROKE_WIDTH}
          />
          {emptyState ? (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="#3f3f46"
              strokeWidth={STROKE_WIDTH}
              strokeDasharray="6 8"
              strokeLinecap="round"
            />
          ) : (
            <motion.circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={false}
              animate={{ strokeDashoffset }}
              transition={TRANSITION}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )}
        </svg>
        <span
          className={`absolute text-zinc-100 ${size === 160 ? "text-4xl" : "text-2xl"} font-light tabular-nums`}
        >
          {emptyState || score === null ? "—" : score}
        </span>
      </button>
      <p className="mt-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 max-w-[140px] text-center text-xs text-zinc-500">
        {sublabel}
      </p>
    </motion.div>
  );

  return content;
}
