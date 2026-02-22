"use client";

import { motion } from "framer-motion";

const SIZE = 140;
const STROKE = 2;
const R = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

const PROGRESS_TRANSITION = { duration: 0.8, ease: "easeInOut" as const };

function getStrokeColor(score: number | null): string {
  if (score === null) return "#52525b";
  if (score < 45) return "#5c3a3a";
  if (score < 70) return "#6b5a2e";
  return "#2d4a3d";
}

type Props = {
  score: number | null;
  onClick?: () => void;
};

export function CircularScore({ score, onClick }: Props) {
  const progress = score ?? 0;
  const strokeColor = getStrokeColor(score);
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        className="relative flex cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:ring-offset-2 focus:ring-offset-[#0F0F12]"
        style={{ width: SIZE, height: SIZE }}
        aria-label={score !== null ? `Decision Fitness score: ${score}` : "Decision Fitness — no data yet"}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="overflow-visible"
        >
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="#3f3f46"
            strokeWidth={STROKE}
          />
          <motion.circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={strokeColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={false}
            animate={{ strokeDashoffset }}
            transition={PROGRESS_TRANSITION}
            transform={`rotate(-90 ${CX} ${CY})`}
          />
        </svg>
        <span
          className="absolute text-3xl font-light tabular-nums text-zinc-100"
          style={{ color: score !== null ? "inherit" : undefined }}
        >
          {score !== null ? score : "—"}
        </span>
      </button>
      <span className="text-xs font-medium tracking-wide text-zinc-500">
        Decision Fitness
      </span>
    </div>
  );
}
