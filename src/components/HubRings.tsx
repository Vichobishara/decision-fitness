"use client";

import { motion } from "framer-motion";

const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
const TRACK = "#1f1f24";
const TRANSITION = { duration: 0.9, ease: "easeInOut" as const };

const METRIC_COLORS = ["#2563eb", "#10b981", "#8b5cf6"] as const; // Claridad, Confianza, Arrepentimiento

type RingSpec = {
  r: number;
  stroke: number;
};

const RINGS: RingSpec[] = [
  { r: 93, stroke: 14 },
  { r: 75, stroke: 10 },
  { r: 60, stroke: 8 },
];

type Props = {
  claridad: number | null;
  confianza: number | null;
  arrepentimiento: number | null;
  onClick?: () => void;
};

export function HubRings({
  claridad,
  confianza,
  arrepentimiento,
  onClick,
}: Props) {
  const scores: (number | null)[] = [claridad, confianza, arrepentimiento];

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
          width: SIZE,
          height: SIZE,
          minWidth: SIZE,
          minHeight: SIZE,
        }}
        aria-label="Ver métricas"
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="overflow-visible"
        >
          {RINGS.map(({ r, stroke }, i) => {
            const score = scores[i];
            const circumference = 2 * Math.PI * r;
            const isNull = score === null;
            const identityColor = METRIC_COLORS[i];
            const strokeDashoffset = isNull
              ? circumference
              : circumference * (1 - score / 100);

            return (
              <g key={i}>
                <circle
                  cx={CX}
                  cy={CY}
                  r={r}
                  fill="none"
                  stroke={TRACK}
                  strokeWidth={stroke}
                  strokeOpacity={0.9}
                />
                {isNull && i === 2 ? (
                  <circle
                    cx={CX}
                    cy={CY}
                    r={r}
                    fill="none"
                    stroke="#3f3f46"
                    strokeWidth={stroke}
                    strokeDasharray="5 6"
                    strokeLinecap="round"
                  />
                ) : !isNull ? (
                  <motion.circle
                    cx={CX}
                    cy={CY}
                    r={r}
                    fill="none"
                    stroke={identityColor}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={false}
                    animate={{ strokeDashoffset }}
                    transition={TRANSITION}
                    transform={`rotate(-90 ${CX} ${CY})`}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
        <span className="absolute flex flex-col items-center justify-center">
          <span className="text-4xl font-light tabular-nums tracking-tight text-zinc-100">
            {claridad !== null ? claridad : "—"}
          </span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Claridad
          </span>
        </span>
      </button>
    </motion.div>
  );
}
