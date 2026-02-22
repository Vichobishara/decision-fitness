"use client";

import { motion } from "framer-motion";

const TRACK = "#1f1f24";
const TRANSITION = { duration: 0.9, ease: "easeInOut" as const };

function identityColorForLabel(label: string): string {
  const key = label.toLowerCase();
  if (key === "claridad") return "#2563eb";
  if (key === "confianza") return "#10b981";
  if (key === "arrepentimiento") return "#8b5cf6";
  return "#71717a";
}

function ringGeometry(size: number, strokeWidth: number) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  return { r, cx, cy, circumference };
}

type Props = {
  score: number | null;
  size: 160 | 110 | 80;
  label: string;
  sublabel: string;
  centerLabel?: string;
  emptyState?: boolean;
  onClick?: () => void;
  /** When true, ring uses label for color but does not render label/sublabel (e.g. mini cards). */
  hideLabel?: boolean;
};

const STROKE_MAIN = 14;
const STROKE_SECONDARY = 12;
const STROKE_SMALL = 6;

export function RingMetric({
  score,
  size,
  label,
  sublabel,
  centerLabel,
  emptyState = false,
  onClick,
  hideLabel = false,
}: Props) {
  const strokeWidth =
    size === 160 ? STROKE_MAIN : size === 110 ? STROKE_SECONDARY : STROKE_SMALL;
  const { r, cx, cy, circumference } = ringGeometry(size, strokeWidth);
  const identityColor = identityColorForLabel(label);
  const showProgress = !emptyState && score !== null;
  const strokeDashoffset = showProgress
    ? circumference * (1 - score! / 100)
    : circumference;

  const containerSize = size;

  return (
    <motion.div
      className="flex flex-col items-center justify-center"
      whileHover={onClick ? { scale: 1.02 } : undefined}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="relative flex cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:ring-offset-2 focus:ring-offset-[#0F0F12] disabled:cursor-default"
        style={{
          width: containerSize,
          height: containerSize,
          minWidth: containerSize,
          minHeight: containerSize,
        }}
        aria-label={
          score !== null && !emptyState
            ? `${label}: ${score}`
            : `${label} — ${emptyState ? "próximamente" : "sin datos"}`
        }
      >
        <svg
          width={containerSize}
          height={containerSize}
          viewBox={`0 0 ${containerSize} ${containerSize}`}
          className="overflow-visible"
        >
          {/* Base dark track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={TRACK}
            strokeWidth={strokeWidth}
            strokeOpacity={0.9}
          />
          {/* Subtle inner highlight (depth) */}
          <circle
            cx={cx}
            cy={cy}
            r={Math.max(0, r - 3)}
            fill="none"
            stroke="#fff"
            strokeWidth={strokeWidth}
            strokeOpacity={0.12}
          />
          {emptyState ? (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="#3f3f46"
              strokeWidth={strokeWidth}
              strokeDasharray="6 8"
              strokeLinecap="round"
            />
          ) : showProgress ? (
            <motion.circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={identityColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={false}
              animate={{ strokeDashoffset }}
              transition={TRANSITION}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ) : null}
        </svg>
        <span className="absolute flex flex-col items-center justify-center">
          <span
            className={`font-light tabular-nums tracking-tight text-zinc-100 ${size === 160 ? "text-4xl" : size === 110 ? "text-2xl" : "text-lg"}`}
          >
            {emptyState || score === null ? "—" : score}
          </span>
          {centerLabel && (
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {centerLabel}
            </span>
          )}
        </span>
      </button>
      {(label || sublabel) && !hideLabel && (
        <>
          <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <p className="mt-1 max-w-[160px] text-center text-xs leading-snug text-zinc-400">
            {sublabel}
          </p>
        </>
      )}
    </motion.div>
  );
}
