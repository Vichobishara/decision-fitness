"use client";

type Props = {
  values: number[];
  width?: number;
  height?: number;
};

const WIDTH = 140;
const HEIGHT = 36;

export function Sparkline({
  values,
  width = WIDTH,
  height = HEIGHT,
}: Props) {
  const hasEnough = values.length >= 2;
  const pts: string[] = [];
  const pad = 2;

  if (hasEnough) {
    const xStep = (width - 2 * pad) / Math.max(1, values.length - 1);
    values.forEach((v, i) => {
      const x = pad + i * xStep;
      const y = height - pad - (v / 100) * (height - 2 * pad);
      pts.push(`${x},${y}`);
    });
  } else {
    const midY = height / 2;
    pts.push(`${pad},${midY}`);
    pts.push(`${width - pad},${midY}`);
  }

  const pathD = `M ${pts.join(" L ")}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden
    >
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
