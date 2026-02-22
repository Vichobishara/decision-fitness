export type Reversibility = "reversible" | "semi" | "irreversible";

export type DecisionInput = {
  reversibility: Reversibility;
  conviction: number; // 1–10
  costIfWrong: number; // 1–10
  energy: number; // -5 to +5
};

export type Recommendation =
  | "ACTUAR_HOY"
  | "PREPARAR_PLAN"
  | "ESPERAR_7_DIAS"
  | "DESCARTAR";

export function calculateClarityScore(input: DecisionInput): number {
  const normalizedEnergy = (input.energy + 5) / 10; // -5..5 → 0..1
  const convictionScore = input.conviction / 10;
  const costPenalty = (10 - input.costIfWrong) / 10; // low cost = higher clarity
  const clarity =
    convictionScore * 0.4 + normalizedEnergy * 0.35 + costPenalty * 0.25;
  return Math.max(0, Math.min(100, Math.round(clarity * 100)));
}

export function getRecommendation(input: DecisionInput): Recommendation {
  const { reversibility, conviction, costIfWrong, energy } = input;

  if (reversibility === "irreversible" && costIfWrong >= 7) {
    return "PREPARAR_PLAN";
  }

  if (energy <= -3) {
    return "ESPERAR_7_DIAS";
  }

  if (conviction >= 8 && costIfWrong <= 4) {
    return "ACTUAR_HOY";
  }

  if (conviction >= 7 && costIfWrong >= 6) {
    return "PREPARAR_PLAN";
  }

  if (conviction <= 4) {
    return "DESCARTAR";
  }

  return "ESPERAR_7_DIAS";
}

export function getReason(
  input: DecisionInput,
  recommendation: string
): string {
  if (recommendation === "ACTUAR_HOY")
    return "Alta convicción y bajo costo. Avanza con un paso pequeño.";
  if (recommendation === "PREPARAR_PLAN")
    return "Decisión de alto impacto. Prepara un plan antes de actuar.";
  if (recommendation === "ESPERAR_7_DIAS")
    return "Date 7 días para revisar con menos ruido.";
  if (recommendation === "DESCARTAR")
    return "La convicción es baja. Mejor no avanzar hoy.";
  return "Revisa los factores y vuelve a evaluar.";
}

/**
 * Spanish reason: clear, actionable, short. Chilean-neutral.
 */
export function getReasonES(
  input: DecisionInput,
  recommendation: string
): string {
  if (recommendation === "ACTUAR_HOY")
    return "Alta convicción y bajo costo. Avanza hoy con un paso pequeño.";
  if (recommendation === "PREPARAR_PLAN")
    return "No tomes la decisión irreversible aún. Prepara un plan concreto.";
  if (recommendation === "ESPERAR_7_DIAS")
    return "Espera 7 días y revisa esta decisión con menos ruido.";
  if (recommendation === "DESCARTAR")
    return "Hoy no vale el costo. Mejor no avanzar.";
  return "Revisa los factores y vuelve a evaluar.";
}
