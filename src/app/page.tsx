"use client";

import { BottomNav, type BottomNavId } from "@/components/BottomNav";
import { CheckInCard, type CheckInData } from "@/components/CheckInCard";
import { CoachButton } from "@/components/CoachButton";
import { CoachModal, type CoachDecisionContext } from "@/components/CoachModal";
import { PublicHomePage } from "@/components/PublicHomePage";
import { Sparkline } from "@/components/Sparkline";
import { HubRings } from "@/components/HubRings";
import { RingMetric } from "@/components/RingMetric";
import {
  calculateClarityScore,
  getReasonES,
  getRecommendation,
  type DecisionInput,
  type Reversibility,
} from "@/lib/decisionEngine";
import { useAuth } from "@/contexts/AuthContext";
import { insertLead } from "@/lib/leads";
import {
  getDecisions,
  getDecisionCount,
  insertDecision,
  insertFollowUp,
  upsertActionPlan,
  mapDbToSavedDecision,
} from "@/lib/supabase-decisions";
import { supabase, type UserRole } from "@/lib/supabase";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

type MetricId = "claridad" | "confianza" | "arrepentimiento";

const transition = { duration: 0.35, ease: "easeInOut" as const };

const SLIDER_CLASS =
  "h-1.5 w-full appearance-none rounded-full bg-zinc-800 accent-zinc-500 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-400 [&::-webkit-slider-thumb]:border-0";

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max).trim() + "…";
}

export type FollowUp = {
  actionTaken: "actue" | "espere" | "descarte";
  regret: boolean;
  outcome: "mejor" | "igual" | "peor";
  updatedAt: string;
};

type ActionPlanItem = { id: string; text: string; done: boolean };
type ActionPlan = {
  items: ActionPlanItem[];
  createdAt: string;
  updatedAt: string;
};

export type DecisionType =
  | "compra"
  | "carrera"
  | "relacion"
  | "proyecto"
  | "salud"
  | "otra";

type SavedDecision = {
  id: string;
  createdAt: string;
  decisionText: string;
  input: DecisionInput;
  score: number;
  recommendation: string;
  reason: string;
  followUp?: FollowUp;
  actionPlan?: ActionPlan;
  decisionType?: DecisionType;
};

const STORAGE_KEY = "decision_fitness_v1_decisions";

function safeParseDecisions(raw: string | null): SavedDecision[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedDecision[];
  } catch {
    return [];
  }
}

function formatSession(n: number) {
  return String(n).padStart(2, "0");
}

function calcAvgClarity(decisions: SavedDecision[]) {
  if (decisions.length === 0) return null;
  const sum = decisions.reduce((acc, d) => acc + (Number(d.score) || 0), 0);
  return Math.round(sum / decisions.length);
}

function calcAvgAlignment(decisions: SavedDecision[]): number | null {
  const withAlignment = decisions.filter(
    (d) => typeof (d.input as Record<string, unknown>)?.alignment === "number"
  );
  if (withAlignment.length === 0) return null;
  const sum = withAlignment.reduce(
    (acc, d) => acc + (Number((d.input as Record<string, unknown>).alignment) || 0),
    0
  );
  return Math.round((sum / withAlignment.length) * 10); // 1–10 → 0–100
}

function getDoubtFromInput(input: SavedDecision["input"]): number {
  const anyInput = input as Record<string, unknown>;
  if (typeof anyInput.conviction === "number")
    return 10 - anyInput.conviction;
  if (typeof anyInput.doubt === "number") return anyInput.doubt;
  return 5;
}

function calcAvgDoubt(decisions: SavedDecision[]): number | null {
  if (decisions.length === 0) return null;
  const sum = decisions.reduce(
    (acc, d) => acc + getDoubtFromInput(d.input),
    0
  );
  return sum / decisions.length;
}

/** Confianza: inverse of average doubt, 0–100. */
function calcConfianza(decisions: SavedDecision[]): number | null {
  const avgDoubt = calcAvgDoubt(decisions);
  if (avgDoubt === null) return null;
  return Math.round((10 - avgDoubt) * 10); // 1–10 doubt → 0–100 confidence
}

const RECOMMENDATION_LABEL: Record<string, string> = {
  ACTUAR_HOY: "Actúa hoy, pero con un paso pequeño.",
  PREPARAR_PLAN:
    "No tomes la decisión irreversible aún. Prepara un plan concreto.",
  ESPERAR_7_DIAS:
    "Espera 7 días y revisa esta decisión con menos ruido.",
  DESCARTAR: "Hoy no vale el costo. Mejor no avanzar.",
};

const ACTION_MODE_LABEL: Record<string, string> = {
  ACTUAR_HOY: "Actuar hoy",
  PREPARAR_PLAN: "Preparar plan",
  ESPERAR_7_DIAS: "Esperar 7 días",
  DESCARTAR: "No avanzar",
};

const ACTION_FRIENDLY_PHRASE: Record<string, string> = {
  ACTUAR_HOY: "Actúa hoy con un paso sencillo.",
  PREPARAR_PLAN: "Prepara un plan detallado.",
  ESPERAR_7_DIAS: "Espera 7 días y revisa con datos.",
  DESCARTAR: "No avanzar por ahora.",
};

const FIRST_STEP_SUGGESTION: Record<string, string> = {
  ACTUAR_HOY: "Reserva tiempo hoy para escribir tu plan mínimo.",
  PREPARAR_PLAN: "Anota riesgos y mitigaciones.",
  ESPERAR_7_DIAS: "Define los datos faltantes y cómo obtenerlos.",
  DESCARTAR: "Libera espacio mental y revisa en 30 días.",
};

const SMALL_STEP_LABEL: Record<string, string> = {
  ACTUAR_HOY: "Da el primer paso concreto hoy (menos de 30 minutos).",
  PREPARAR_PLAN: "Define 3 riesgos y cómo mitigarlos antes de decidir.",
  ESPERAR_7_DIAS: "Anota qué información necesitas y revísalo en 7 días.",
  DESCARTAR: "Si en 30 días sigue importando, reevalúalo.",
};

function getDiagnosticLine(
  reversibility: Reversibility,
  conviction: number,
  costIfWrong: number,
  energy: number
): string {
  if (reversibility === "irreversible" && costIfWrong >= 7)
    return "Decisión difícil de revertir con alto costo.";
  if (energy <= -3) return "Energía negativa y alta incertidumbre.";
  if (conviction >= 8 && costIfWrong <= 4) return "Alta convicción y bajo costo.";
  if (conviction >= 7 && costIfWrong >= 6)
    return "Alta convicción pero alto costo.";
  if (conviction <= 4) return "Baja convicción.";
  return "Incertidumbre moderada; conviene esperar.";
}

function getSystemConfidence(decisionsCount: number): "Baja" | "Media" | "Alta" {
  if (decisionsCount < 5) return "Baja";
  if (decisionsCount <= 15) return "Media";
  return "Alta";
}

function levelFromScore(score: number | null): "Alta" | "Media" | "Baja" | null {
  if (score === null) return null;
  if (score >= 70) return "Alta";
  if (score >= 45) return "Media";
  return "Baja";
}

function interpretationClaridad(score: number | null): string {
  if (score === null) return "Registra decisiones para ver tu lectura.";
  if (score >= 70) return "Tus decisiones tienden a ser coherentes.";
  if (score >= 45) return "Hay espacio para ganar claridad.";
  return "Tus decisiones no están siendo consistentes.";
}

function interpretationConfianza(score: number | null): string {
  if (score === null) return "Más datos para ver tu nivel de confianza.";
  if (score >= 70) return "Cierras bien; poca duda al decidir.";
  if (score >= 45) return "Tu duda está en rango medio.";
  return "Estás dudando más de lo ideal.";
}

function calcRegretMetrics(decisions: SavedDecision[]): {
  regretRate: number | null;
  regretCount: number;
  followedCount: number;
} {
  const withFollowUp = decisions.filter((d) => d?.followUp != null);
  const followedCount = withFollowUp.length;
  const regretCount = withFollowUp.filter((d) => d.followUp?.regret === true).length;
  const regretRate =
    followedCount === 0 ? null : Math.round((regretCount / followedCount) * 100);
  return { regretRate, regretCount, followedCount };
}

function levelFromRegretRate(regretRate: number | null): "Bajo" | "Medio" | "Alto" | null {
  if (regretRate === null) return null;
  if (regretRate <= 15) return "Bajo";
  if (regretRate <= 35) return "Medio";
  return "Alto";
}

function interpretationArrepentimiento(regretRate: number | null): string {
  if (regretRate === null) return "Actívalo con seguimiento";
  return "Cuántas decisiones lamentas con el tiempo.";
}

/** Last 7 decisions in chronological order (oldest first). */
function getLast7Chrono(decisions: SavedDecision[]): SavedDecision[] {
  return decisions.slice(0, 7).reverse();
}

function buildTrendSeries(decisions: SavedDecision[]): {
  claritySeries: number[];
  confidenceSeries: number[];
  clarityDelta: number | null;
  confidenceDelta: number | null;
  trendCount: number;
} {
  const last7 = getLast7Chrono(decisions);
  const claritySeries = last7.map((d) => d.score);
  const confidenceSeries = last7.map((d) =>
    Math.round((10 - getDoubtFromInput(d.input)) * 10)
  );
  const n = claritySeries.length;
  const clarityDelta =
    n >= 2 ? claritySeries[n - 1]! - claritySeries[0]! : null;
  const confidenceDelta =
    n >= 2 ? confidenceSeries[n - 1]! - confidenceSeries[0]! : null;
  return {
    claritySeries,
    confidenceSeries,
    clarityDelta,
    confidenceDelta,
    trendCount: n,
  };
}

function formatDelta(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

function getWeeklyInsight(
  clarityDelta: number | null,
  confidenceDelta: number | null,
  regretRate: number | null
): string {
  if (clarityDelta !== null && clarityDelta >= 5)
    return "Claridad subiendo: estás decidiendo más consistente.";
  if (clarityDelta !== null && clarityDelta <= -5)
    return "Claridad bajando: reduce variables y decide con un paso pequeño.";
  if (confidenceDelta !== null && confidenceDelta <= -5)
    return "Confianza bajando: define 3 criterios antes de decidir.";
  if (regretRate !== null && regretRate > 35)
    return "Arrepentimiento alto: usa «Preparar plan» en decisiones difíciles de revertir.";
  return "Buen ritmo. Mantén el seguimiento para aprender más.";
}

/** Which metric has the lowest score (for "qué mejorar" tip). */
function lowestMetric(
  claridad: number | null,
  confianzaVal: number | null
): "claridad" | "confianza" | null {
  if (claridad === null && confianzaVal === null) return null;
  if (claridad === null) return "confianza";
  if (confianzaVal === null) return "claridad";
  return claridad <= confianzaVal ? "claridad" : "confianza";
}

function tipForMetric(
  metric: "claridad" | "confianza" | null,
  avgClarity: number | null,
  confianzaVal: number | null
): string {
  if (metric === "claridad") {
    if (avgClarity === null) return "Registra una decisión para recibir tu primer tip.";
    if (avgClarity >= 70) return "Mantén el ritmo: una decisión pequeña por semana.";
    if (avgClarity >= 45) return "Antes de decidir, escribe en una línea qué pasaría si te equivocas.";
    return "Elige una sola decisión pendiente y date 7 días antes de actuar.";
  }
  if (metric === "confianza") {
    return "Reduce la incertidumbre: anota qué información te falta y define un criterio claro antes de decidir.";
  }
  return "Registra decisiones para ver tu próximo paso.";
}

function formatFriendlyDate(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const month = months[d.getMonth()] ?? "";
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function getInputDisplay(input: SavedDecision["input"]): {
  conviccion: string;
  costo: string;
  energia: string;
  reversibilidad: string;
} {
  const anyInput = input as Record<string, unknown>;
  const conviction = typeof anyInput.conviction === "number" ? anyInput.conviction : (typeof anyInput.doubt === "number" ? 10 - (anyInput.doubt as number) : "—");
  const cost = typeof anyInput.costIfWrong === "number" ? anyInput.costIfWrong : (typeof anyInput.financialImpact === "number" ? anyInput.financialImpact : "—");
  const energy = typeof anyInput.energy === "number" ? anyInput.energy : (typeof anyInput.emotionalEnergy === "number" ? anyInput.emotionalEnergy : "—");
  const rev = anyInput.reversibility ?? "—";
  return {
    conviccion: String(conviction),
    costo: String(cost),
    energia: String(energy),
    reversibilidad: typeof rev === "string" ? rev : "—",
  };
}

const ACTION_TAKEN_LABEL: Record<string, string> = {
  actue: "Actué",
  espere: "Esperé",
  descarte: "Lo descarté",
};
const OUTCOME_LABEL: Record<string, string> = {
  mejor: "Mejor",
  igual: "Igual",
  peor: "Peor",
};

function actionContradictsRecommendation(
  recommendation: string,
  actionTaken: FollowUp["actionTaken"]
): boolean {
  if (recommendation === "ACTUAR_HOY" && (actionTaken === "espere" || actionTaken === "descarte"))
    return true;
  if (recommendation === "ESPERAR_7_DIAS" && actionTaken === "actue") return true;
  if (recommendation === "PREPARAR_PLAN" && actionTaken === "actue") return true;
  if (recommendation === "DESCARTAR" && actionTaken === "actue") return true;
  return false;
}

function getReplayEvaluationText(
  recommendation: string,
  actionTaken: FollowUp["actionTaken"],
  outcome: FollowUp["outcome"]
): string {
  if (recommendation === "ESPERAR_7_DIAS" && actionTaken === "actue" && outcome === "peor")
    return "El sistema probablemente tenía razón.";
  if (recommendation === "ACTUAR_HOY" && actionTaken === "actue" && outcome === "mejor")
    return "La recomendación fue acertada.";
  if (recommendation === "PREPARAR_PLAN" && actionTaken === "actue" && outcome === "peor")
    return "Actuar sin plan aumentó el riesgo.";
  if (actionContradictsRecommendation(recommendation, actionTaken) && outcome === "mejor")
    return "El sistema fue conservador en esta ocasión.";
  return "Resultado coherente con la decisión tomada.";
}

function genId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const ACTION_PLAN_TEMPLATES: Record<string, string[]> = {
  ACTUAR_HOY: [
    "Define el primer paso (30 min)",
    "Hazlo hoy",
    "Revisa cómo te sientes",
  ],
  PREPARAR_PLAN: [
    "Escribe 3 riesgos y mitigaciones",
    "Define plan mínimo (qué, cuándo)",
    "Agenda fecha de decisión",
  ],
  ESPERAR_7_DIAS: [
    "Anota qué información falta",
    "Haz plan de recolección de info",
    "Revisa en 7 días",
  ],
  DESCARTAR: [
    "Escribe por qué no vale el costo",
    "Archiva por ahora",
    "Reevalúa si cambia la información",
  ],
};

function getDefaultActionPlanTemplate(recommendation: string): ActionPlan {
  const now = new Date().toISOString();
  const texts =
    ACTION_PLAN_TEMPLATES[recommendation] ?? ACTION_PLAN_TEMPLATES.ESPERAR_7_DIAS!;
  return {
    items: texts.map((text) => ({ id: genId(), text, done: false })),
    createdAt: now,
    updatedAt: now,
  };
}

type PlaybookEntry = {
  diagnosis: string;
  actionTitle: string;
  nextStep: string;
  playbookSteps: string[];
};

const PLAYBOOK: Record<string, Record<DecisionType, PlaybookEntry>> = {
  ACTUAR_HOY: {
    compra: {
      diagnosis: "Alta convicción y bajo costo de error.",
      actionTitle: "Actuar hoy",
      nextStep: "Da un paso concreto en las próximas 24 h.",
      playbookSteps: [
        "Fija un tope de gasto antes de pagar.",
        "Si supera el tope, espera 24 h y repasa necesidad.",
      ],
    },
    carrera: {
      diagnosis: "Alta convicción y bajo costo de error.",
      actionTitle: "Actuar hoy",
      nextStep: "Da un paso concreto en las próximas 24 h.",
      playbookSteps: [
        "Envía un mensaje o correo que avance (reunión, CV, pregunta).",
        "Anota el siguiente paso y fecha límite.",
      ],
    },
    relacion: {
      diagnosis: "Alta convicción y bajo costo de error.",
      actionTitle: "Actuar hoy",
      nextStep: "Da un paso concreto en las próximas 24 h.",
      playbookSteps: [
        "Haz una acción pequeña y clara (mensaje, llamada, propuesta).",
        "Define qué necesitas a cambio y en qué plazo.",
      ],
    },
    proyecto: {
      diagnosis: "Alta convicción y bajo costo de error.",
      actionTitle: "Actuar hoy",
      nextStep: "Da un paso concreto en las próximas 24 h.",
      playbookSteps: [
        "Bloquea 30 min hoy para el primer paso real.",
        "Cierra el paso en una frase y compártelo con alguien.",
      ],
    },
    salud: {
      diagnosis: "Alta convicción y bajo costo de error.",
      actionTitle: "Actuar hoy",
      nextStep: "Da un paso concreto en las próximas 24 h.",
      playbookSteps: [
        "Agenda o ejecuta una sola acción (cita, compra, llamada).",
        "Anota el siguiente paso para esta semana.",
      ],
    },
    otra: {
      diagnosis: "Alta convicción y bajo costo de error.",
      actionTitle: "Actuar hoy",
      nextStep: "Da un paso concreto en las próximas 24 h.",
      playbookSteps: [
        "Da el primer paso concreto hoy (menos de 30 minutos).",
        "Define el siguiente paso y una fecha.",
      ],
    },
  },
  PREPARAR_PLAN: {
    compra: {
      diagnosis: "Decisión con alto costo si sale mal.",
      actionTitle: "Preparar plan",
      nextStep: "No pagues aún; prepara criterios y plan B.",
      playbookSteps: [
        "Lista 3 riesgos (financiero, uso, arrepentimiento).",
        "Define presupuesto máximo y regla de salida.",
      ],
    },
    carrera: {
      diagnosis: "Decisión difícil de revertir con alto costo.",
      actionTitle: "Preparar plan",
      nextStep: "No renuncies ni firmes aún; prepara plan B.",
      playbookSteps: [
        "Define tu runway (meses de caja).",
        "Activa plan B: 3 conversaciones o entrevistas.",
        "Fija una fecha de decisión (7–14 días).",
      ],
    },
    relacion: {
      diagnosis: "Decisión con alto impacto emocional.",
      actionTitle: "Preparar plan",
      nextStep: "No actúes por impulso; prepara qué quieres decir y qué necesitas.",
      playbookSteps: [
        "Escribe en una frase qué quieres lograr.",
        "Define 3 escenarios (sí / no / aplazar) y qué harías.",
      ],
    },
    proyecto: {
      diagnosis: "Decisión difícil de revertir con alto costo.",
      actionTitle: "Preparar plan",
      nextStep: "No comprometas recursos grandes aún; diseña el plan.",
      playbookSteps: [
        "Lista 3 riesgos principales y cómo mitigarlos.",
        "Define un hito de «no seguir» y fecha de revisión.",
      ],
    },
    salud: {
      diagnosis: "Decisión con alto impacto en tu bienestar.",
      actionTitle: "Preparar plan",
      nextStep: "No cambies todo de golpe; prepara pasos y respaldo.",
      playbookSteps: [
        "Anota qué quieres lograr y en qué plazo.",
        "Consulta o investiga una alternativa antes de decidir.",
      ],
    },
    otra: {
      diagnosis: "Decisión difícil de revertir o con alto costo.",
      actionTitle: "Preparar plan",
      nextStep: "Prepara un plan antes de actuar.",
      playbookSteps: [
        "Define 3 riesgos y cómo mitigarlos.",
        "Fija una fecha de decisión y criterios de salida.",
      ],
    },
  },
  ESPERAR_7_DIAS: {
    compra: {
      diagnosis: "Poca evidencia o presión; conviene esperar.",
      actionTitle: "Esperar 7 días",
      nextStep: "No compres hoy; revisa en 7 días con calma.",
      playbookSteps: [
        "Espera 24 h antes de pagar (mínimo).",
        "Define presupuesto máximo.",
        "Si aún lo quieres, aplica regla 1-in-1-out.",
      ],
    },
    carrera: {
      diagnosis: "Poca evidencia o alta presión; conviene esperar.",
      actionTitle: "Esperar 7 días",
      nextStep: "No renuncies ni aceptes hoy; revisa en 7 días.",
      playbookSteps: [
        "Anota qué información te falta.",
        "Pon recordatorio en 7 días.",
        "Revisa con calma antes de decidir.",
      ],
    },
    relacion: {
      diagnosis: "Poca evidencia o presión emocional; conviene esperar.",
      actionTitle: "Esperar 7 días",
      nextStep: "No actúes hoy; revisa en 7 días con menos ruido.",
      playbookSteps: [
        "Anota qué quieres decir y qué necesitas saber.",
        "Pon recordatorio en 7 días.",
        "Revisa si sigues queriendo lo mismo.",
      ],
    },
    proyecto: {
      diagnosis: "Poca evidencia o presión; conviene esperar.",
      actionTitle: "Esperar 7 días",
      nextStep: "No comprometas hoy; revisa en 7 días.",
      playbookSteps: [
        "Anota qué información necesitas.",
        "Pon recordatorio en 7 días.",
        "Revisa con calma antes de decidir.",
      ],
    },
    salud: {
      diagnosis: "Poca evidencia o presión; conviene esperar.",
      actionTitle: "Esperar 7 días",
      nextStep: "No cambies nada drástico hoy; revisa en 7 días.",
      playbookSteps: [
        "Anota qué te gustaría lograr.",
        "Pon recordatorio en 7 días.",
        "Revisa con calma y con datos si es posible.",
      ],
    },
    otra: {
      diagnosis: "Incertidumbre moderada; conviene esperar.",
      actionTitle: "Esperar 7 días",
      nextStep: "Revisa en 7 días con menos ruido.",
      playbookSteps: [
        "Anota qué información necesitas.",
        "Pon recordatorio en 7 días.",
        "Revisa con calma antes de decidir.",
      ],
    },
  },
  DESCARTAR: {
    compra: {
      diagnosis: "Baja convicción o alto costo; mejor no avanzar hoy.",
      actionTitle: "No avanzar",
      nextStep: "No compres hoy; si en 30 días sigue importando, reevalúa.",
      playbookSteps: [
        "Anota el ítem por si reaparece.",
        "Revisa en 30 días si sigue siendo prioridad.",
      ],
    },
    carrera: {
      diagnosis: "Baja convicción o alto costo; mejor no avanzar hoy.",
      actionTitle: "No avanzar",
      nextStep: "No cambies nada hoy; si en 30 días sigue importando, reevalúa.",
      playbookSteps: [
        "Anota la idea o opción por si reaparece.",
        "Enfoca en tu prioridad actual.",
        "Revisa en 30 días si sigue siendo relevante.",
      ],
    },
    relacion: {
      diagnosis: "Baja convicción o alto costo emocional; mejor no avanzar hoy.",
      actionTitle: "No avanzar",
      nextStep: "No actúes por obligación; si en 30 días sigue importando, reevalúa.",
      playbookSteps: [
        "Anota qué sentiste o quisiste.",
        "Revisa en 30 días si sigue siendo importante.",
      ],
    },
    proyecto: {
      diagnosis: "Baja convicción o alto costo; mejor no avanzar hoy.",
      actionTitle: "No avanzar",
      nextStep: "No inviertas tiempo hoy; si en 30 días sigue importando, reevalúa.",
      playbookSteps: [
        "Deja anotado por si reaparece.",
        "Enfoca en el proyecto con más tracción.",
        "Revisa en 30 días si sigue siendo prioridad.",
      ],
    },
    salud: {
      diagnosis: "Baja convicción o alto costo; mejor no avanzar hoy.",
      actionTitle: "No avanzar",
      nextStep: "No cambies nada hoy; si en 30 días sigue importando, reevalúa.",
      playbookSteps: [
        "Anota la meta o cambio por si reaparece.",
        "Revisa en 30 días con calma.",
      ],
    },
    otra: {
      diagnosis: "Baja convicción; mejor no avanzar hoy.",
      actionTitle: "No avanzar",
      nextStep: "Si en 30 días sigue importando, reevalúalo.",
      playbookSteps: [
        "Deja anotado por si reaparece.",
        "Revisa en 30 días si sigue importando.",
      ],
    },
  },
};

function buildIAHelperPrompt(
  helperId: "alternativas" | "resumir_evidencia" | "detectar_sesgos" | "mejorar_why" | "frases_motivadoras",
  state: {
    decisionText: string;
    stage1Objective: string;
    stage2Alternatives: string[];
    stage3EvidenceFor: string;
    stage3EvidenceMissing: string;
    stage4Cost: string;
    stage4Reversibility: string;
    stage5State: string;
    recommendation?: string;
    firstStep?: string;
  }
): string {
  const altList = state.stage2Alternatives.filter(Boolean).join(", ") || "(ninguna aún)";
  switch (helperId) {
    case "alternativas":
      return `Generate 3 additional realistic alternatives for:\n${state.decisionText}\nbased on existing alternatives:\n${altList}`;
    case "resumir_evidencia":
      return `Generate a friendly 4-bullet summary of evidence and missing data using:\nA favor: ${state.stage3EvidenceFor || "(vacío)"}\nFalta por confirmar: ${state.stage3EvidenceMissing || "(vacío)"}`;
    case "detectar_sesgos":
      return `Detect cognitive bias in:\nObjetivo: ${state.stage1Objective || "(vacío)"}\nAlternativas: ${altList}\nReturn name, explanation, mitigation`;
    case "mejorar_why":
      return `Using:\nObjetivo: ${state.stage1Objective}\nAlternativas: ${altList}\nEvidencia a favor: ${state.stage3EvidenceFor}\nFalta: ${state.stage3EvidenceMissing}\nReversibilidad: ${state.stage4Reversibility}, Costo: ${state.stage4Cost}, Estado: ${state.stage5State}\nGenerate a human explanation WHY in 2–3 lines`;
    case "frases_motivadoras":
      return `Given:\nModo: ${state.recommendation ?? ""}\nPrimer paso: ${state.firstStep ?? ""}\nGenerate 3 friendly motivational phrases`;
    default:
      return "";
  }
}

function getPlaybook(
  recommendation: string,
  decisionType: DecisionType
): PlaybookEntry {
  const byRec = PLAYBOOK[recommendation];
  if (!byRec) {
    return {
      diagnosis: "Revisa los factores y vuelve a evaluar.",
      actionTitle: recommendation,
      nextStep: "Define tu próximo paso.",
      playbookSteps: ["Anota qué necesitas para decidir.", "Revisa en 7 días."],
    };
  }
  const entry = byRec[decisionType] ?? byRec.otra;
  return entry;
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, profile, loading: authLoading, signOut } = useAuth();
  const isDemoMode = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !session &&
    searchParams.get("demo") === "1"
  );

  const [screen, setScreen] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [decisionText, setDecisionText] = useState("");
  const [showFreeLimitModal, setShowFreeLimitModal] = useState(false);

  const [decisionsLoading, setDecisionsLoading] = useState(false);
  const [toastError, setToastError] = useState<string | null>(null);

  const [decisions, setDecisions] = useState<SavedDecision[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<SavedDecision | null>(null);
  const [followUpSavedMessage, setFollowUpSavedMessage] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState(false);
  const [followUpForm, setFollowUpForm] = useState<{
    actionTaken: FollowUp["actionTaken"];
    regret: boolean;
    outcome: FollowUp["outcome"];
  }>({ actionTaken: "actue", regret: false, outcome: "igual" });

  const loadDecisionsFromSupabase = useCallback(async (userId: string) => {
    setDecisionsLoading(true);
    try {
      const { decisions: dbDecisions, followUps, actionPlans } = await getDecisions(userId);
      const mapped = dbDecisions.map((d) => mapDbToSavedDecision(d, followUps, actionPlans) as SavedDecision);
      setDecisions(mapped);
    } catch (e) {
      setToastError("No se pudo cargar. Reintenta.");
      setTimeout(() => setToastError(null), 3000);
    } finally {
      setDecisionsLoading(false);
    }
  }, []);

  const hasSupabase = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    if (!hasSupabase) {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      setDecisions(safeParseDecisions(raw));
      return;
    }
    if (session?.user?.id) {
      loadDecisionsFromSupabase(session.user.id);
    } else if (!authLoading) {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      setDecisions(safeParseDecisions(raw));
    }
  }, [hasSupabase, session?.user?.id, authLoading, loadDecisionsFromSupabase]);

  useEffect(() => {
    if (typeof window === "undefined" || !session) return;
    const prefill = sessionStorage.getItem("decision_fitness_prefill");
    if (prefill) {
      setDecisionText(prefill);
      sessionStorage.removeItem("decision_fitness_prefill");
    }
  }, [session]);

  const [decisionType, setDecisionType] = useState<DecisionType>("otra");
  const [reversibility, setReversibility] =
    useState<Reversibility>("semi");
  const [costOption, setCostOption] = useState<"bajo" | "medio" | "alto">("medio");
  const [evidenceOption, setEvidenceOption] = useState<"poca" | "media" | "alta">("media");
  const [pressureOption, setPressureOption] = useState<"calma" | "presion">("calma");

  const [formStage, setFormStage] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [stage1Objective, setStage1Objective] = useState("");
  const [stage2Alternatives, setStage2Alternatives] = useState<string[]>(["", ""]);
  const [stage3EvidenceFor, setStage3EvidenceFor] = useState("");
  const [stage3EvidenceMissing, setStage3EvidenceMissing] = useState("");
  const [stage4Cost, setStage4Cost] = useState<"bajo" | "medio" | "alto">("medio");
  const [stage4Reversibility, setStage4Reversibility] = useState<Reversibility>("semi");
  const [stage5State, setStage5State] = useState<"calmado" | "bajo presion" | "ansioso">("calmado");
  const [stageError, setStageError] = useState<string | null>(null);
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);
  const [resultDraftPlan, setResultDraftPlan] = useState<ActionPlan | null>(null);
  const [aiHelperPrompt, setAiHelperPrompt] = useState<string | null>(null);
  const [aiHelperCopied, setAiHelperCopied] = useState(false);

  const [score, setScore] = useState(0);
  const [recommendation, setRecommendation] = useState("");
  const [reason, setReason] = useState("");

  const [metricDetail, setMetricDetail] = useState<MetricId | null>(null);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [coachModalOpen, setCoachModalOpen] = useState(false);
  const [checkInByDecisionId, setCheckInByDecisionId] = useState<Record<string, CheckInData>>({});
  const [demoEmail, setDemoEmail] = useState("");
  const [demoEmailSubmitting, setDemoEmailSubmitting] = useState(false);
  const [demoEmailSuccess, setDemoEmailSuccess] = useState(false);

  const sessionNumber = decisions.length + 1;
  const avgClarity = calcAvgClarity(decisions);
  const avgAlignment = calcAvgAlignment(decisions);
  const confianza = calcConfianza(decisions);
  const { regretRate, regretCount, followedCount } = calcRegretMetrics(decisions);
  const {
    claritySeries,
    confidenceSeries,
    clarityDelta,
    confidenceDelta,
    trendCount,
  } = buildTrendSeries(decisions);
  const lastDecision = decisions[0] ?? null;

  const handleStartAnalysis = () => {
    setDecisionText((t) => t.trim() || "Decisión sin título");
    setFormStage(1);
    setStage1Objective("");
    setStage2Alternatives(["", ""]);
    setStage3EvidenceFor("");
    setStage3EvidenceMissing("");
    setStage4Cost("medio");
    setStage4Reversibility("semi");
    setStage5State("calmado");
    setScreen(2);
  };

  const showTransition = (msg: string) => {
    setStageError(null);
    setTransitionMessage(msg);
    setTimeout(() => setTransitionMessage(null), 2500);
  };

  const handleStage1Next = () => {
    if (!stage1Objective.trim()) {
      setStageError("Necesitamos entender tu objetivo para ayudarte a pensar mejor.");
      return;
    }
    showTransition("Respira… paso siguiente.");
    setFormStage(2);
  };

  const handleStage2Next = () => {
    const hasOne = stage2Alternatives.some((a) => a.trim().length > 0);
    if (!hasOne) {
      setStageError("Agrega al menos una alternativa o confirma que no hay más.");
      return;
    }
    showTransition("Buen avance — sigamos.");
    setFormStage(3);
  };

  const handleStage3Next = () => {
    if (!stage3EvidenceFor.trim() && !stage3EvidenceMissing.trim()) {
      setStageError("Completa al menos una de las dos para seguir reflexionando.");
      return;
    }
    showTransition("Esto nos da claridad.");
    setFormStage(4);
  };

  const handleStage4Next = () => {
    showTransition("Casi listo.");
    setFormStage(5);
  };

  const handleGuidedResult = () => {
    const costIfWrong =
      stage4Cost === "bajo" ? 3 : stage4Cost === "medio" ? 6 : 9;
    const energy =
      stage5State === "calmado" ? 0 : stage5State === "bajo presion" ? -3 : -4;
    const input: DecisionInput = {
      reversibility: stage4Reversibility,
      conviction: 6,
      costIfWrong,
      energy,
    };
    setReversibility(stage4Reversibility);
    setCostOption(stage4Cost);
    setEvidenceOption("media");
    setPressureOption(stage5State === "calmado" ? "calma" : "presion");
    const s = calculateClarityScore(input);
    const rec = getRecommendation(input);
    const why = getReasonES(input, rec);
    setScore(s);
    setRecommendation(rec);
    setReason(why);
    setResultDraftPlan(getDefaultActionPlanTemplate(rec));
    setScreen(3);
  };

  const mapFormToEngine = () => {
    const conviction =
      evidenceOption === "poca" ? 3 : evidenceOption === "media" ? 6 : 9;
    const costIfWrong =
      costOption === "bajo" ? 3 : costOption === "medio" ? 6 : 9;
    const energy = pressureOption === "calma" ? 0 : -4;
    return { reversibility, conviction, costIfWrong, energy };
  };

  const handleGetResult = () => {
    const { reversibility: r, conviction, costIfWrong, energy } = mapFormToEngine();
    const input: DecisionInput = { reversibility: r, conviction, costIfWrong, energy };
    const s = calculateClarityScore(input);
    const rec = getRecommendation(input);
    const why = getReasonES(input, rec);
    setScore(s);
    setRecommendation(rec);
    setReason(why);
    setScreen(3);
  };

  const handleSaveDecision = async () => {
    const { reversibility: r, conviction, costIfWrong, energy } = mapFormToEngine();
    const input: DecisionInput = { reversibility: r, conviction, costIfWrong, energy };

    if (session?.user?.id) {
      if (profile?.role === "free") {
        const count = await getDecisionCount(session.user.id);
        if (count >= 10) {
          setShowFreeLimitModal(true);
          return;
        }
      }
      const costLevel = stage4Cost || (costOption === "bajo" ? "bajo" : costOption === "medio" ? "medio" : "alto");
      const rev = stage4Reversibility || reversibility;
      const emotionalState = stage5State || (pressureOption === "calma" ? "calmado" : "bajo presion");
      const { data: inserted, error } = await insertDecision({
        user_id: session.user.id,
        decision_text: decisionText,
        objective: stage1Objective?.trim() || null,
        alternatives: stage2Alternatives.filter(Boolean).length ? stage2Alternatives.filter(Boolean) : null,
        evidence_for: stage3EvidenceFor?.trim() || null,
        evidence_missing: stage3EvidenceMissing?.trim() || null,
        cost_level: costLevel,
        reversibility: rev,
        emotional_state: emotionalState,
        score,
        recommendation,
        reason_text: reason,
        decision_type: decisionType || null,
      });
      if (error) {
        setToastError("No se pudo guardar. Reintenta.");
        setTimeout(() => setToastError(null), 3000);
        return;
      }
      if (inserted && resultDraftPlan?.items?.length) {
        await upsertActionPlan(inserted.id, resultDraftPlan.items);
      }
      await loadDecisionsFromSupabase(session.user.id);
      if (inserted && checkInByDecisionId["current"]) {
        setCheckInByDecisionId((prev) => {
          const next = { ...prev };
          next[inserted.id] = prev["current"];
          delete next["current"];
          return next;
        });
      }
      setShowSaveToast(true);
      setResultDraftPlan(null);
      setTimeout(() => setShowSaveToast(false), 2500);
      return;
    }

    const entry: SavedDecision = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Date.now()),
      createdAt: new Date().toISOString(),
      decisionText,
      input,
      score,
      recommendation,
      reason,
      decisionType,
      ...(resultDraftPlan && { actionPlan: resultDraftPlan }),
    };

    setDecisions((prev) => {
      const next = [entry, ...prev];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
    if (checkInByDecisionId["current"]) {
      setCheckInByDecisionId((prev) => {
        const next = { ...prev };
        next[entry.id] = prev["current"];
        delete next["current"];
        return next;
      });
    }

    setShowSaveToast(true);
    setResultDraftPlan(null);
    setTimeout(() => setShowSaveToast(false), 2500);
  };

  const goToMetricDetail = (id: MetricId) => {
    setMetricDetail(id);
    setScreen(4);
  };

  const bottomNavActiveId: BottomNavId =
    screen === 1 ? "home" : screen === 4 ? "metricas" : screen === 5 ? "historial" : "home";

  const handleBottomNavSelect = (id: BottomNavId) => {
    if (id === "home") setScreen(1);
    else if (id === "metricas") {
      setMetricDetail(null);
      setScreen(4);
    } else if (id === "historial") {
      setSelectedDecision(null);
      setScreen(5);
    }
  };
  const showBottomNav = screen !== 6;

  const saveFollowUp = async (decisionId: string) => {
    const followUp: FollowUp = {
      ...followUpForm,
      updatedAt: new Date().toISOString(),
    };
    if (session?.user?.id) {
      const { error } = await insertFollowUp(decisionId, {
        action_taken: followUpForm.actionTaken,
        regret: followUpForm.regret,
        outcome: followUpForm.outcome,
      });
      if (error) {
        setToastError("No se pudo guardar. Reintenta.");
        setTimeout(() => setToastError(null), 3000);
        return;
      }
      await loadDecisionsFromSupabase(session.user.id);
      setSelectedDecision((d) => (d?.id === decisionId ? { ...d, followUp } : d));
      setFollowUpSavedMessage(true);
      setEditingFollowUp(false);
      setTimeout(() => setFollowUpSavedMessage(false), 2500);
      return;
    }
    setDecisions((prev) => {
      const next = prev.map((d) =>
        d.id === decisionId ? { ...d, followUp } : d
      );
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setSelectedDecision((d) => (d?.id === decisionId ? { ...d, followUp } : d));
    setFollowUpSavedMessage(true);
    setEditingFollowUp(false);
    setTimeout(() => setFollowUpSavedMessage(false), 2500);
  };

  useEffect(() => {
    if (!selectedDecision?.id || selectedDecision.actionPlan != null) return;
    const template = getDefaultActionPlanTemplate(selectedDecision.recommendation);
    const updated: SavedDecision = { ...selectedDecision, actionPlan: template };
    setDecisions((prev) => {
      const next = prev.map((d) => (d.id === selectedDecision.id ? updated : d));
      if (!session?.user?.id) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
    setSelectedDecision(updated);
  }, [selectedDecision?.id, selectedDecision?.actionPlan, session?.user?.id]);

  const updateActionPlan = async (decisionId: string, updater: (plan: ActionPlan) => ActionPlan) => {
    const current = decisions.find((d) => d.id === decisionId);
    const currentPlan = current?.actionPlan;
    const newPlan = currentPlan
      ? updater({ ...currentPlan, updatedAt: new Date().toISOString() })
      : null;
    const applyUpdate = (d: SavedDecision): SavedDecision => {
      if (d.id !== decisionId || !d.actionPlan) return d;
      const updated = updater({ ...d.actionPlan, updatedAt: new Date().toISOString() });
      return { ...d, actionPlan: updated };
    };
    setDecisions((prev) => {
      const next = prev.map(applyUpdate);
      if (!session?.user?.id) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
    setSelectedDecision((d) => (d ? applyUpdate(d) : d));
    if (session?.user?.id && newPlan) {
      const { error } = await upsertActionPlan(decisionId, newPlan.items);
      if (error) {
        setToastError("No se pudo guardar. Reintenta.");
        setTimeout(() => setToastError(null), 3000);
        await loadDecisionsFromSupabase(session.user.id);
      }
    }
  };

  const avgDoubt = calcAvgDoubt(decisions);

  if (hasSupabase && authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0F0F12] px-6" style={{ backgroundColor: "#0F0F12" }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" aria-hidden />
        <p className="mt-4 text-sm text-zinc-500">Cargando…</p>
      </div>
    );
  }

  if (hasSupabase && !session && !isDemoMode) {
    return <PublicHomePage />;
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-[#0F0F12] px-6 pb-28 pt-8"
      style={{ backgroundColor: "#0F0F12" }}
    >
      {showBottomNav && !isDemoMode && (
        <BottomNav
          activeId={bottomNavActiveId}
          onSelect={handleBottomNavSelect}
          showProBadge={profile?.role === "pro"}
        />
      )}

      {(screen === 1 || screen === 3 || screen === 5) && session && !isDemoMode && (
        <CoachButton
          isPro={profile?.role === "pro"}
          onClick={() => setCoachModalOpen(true)}
        />
      )}
      <CoachModal
        open={coachModalOpen}
        onClose={() => setCoachModalOpen(false)}
        isPro={profile?.role === "pro"}
        decisionContext={
          screen === 3
            ? { decisionText, recommendation, score }
            : selectedDecision
              ? { decisionText: selectedDecision.decisionText, recommendation: selectedDecision.recommendation, score: selectedDecision.score }
              : null
        }
        onVerPlanPro={() => { setCoachModalOpen(false); setScreen(6); }}
      />

      <AnimatePresence>
        {showSaveToast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-zinc-700/80 bg-zinc-900/95 px-4 py-2.5 text-sm text-zinc-200 shadow-lg"
          >
            Decisión guardada.
          </motion.div>
        )}
        {toastError && (
          <motion.div
            key="toastError"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-900/80 bg-zinc-900/95 px-4 py-2.5 text-sm text-red-200 shadow-lg"
          >
            {toastError}
          </motion.div>
        )}
      </AnimatePresence>

      {showFreeLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowFreeLimitModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl"
          >
            <h2 className="text-lg font-medium text-zinc-100">Límite del plan Free</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Llegaste a 10 decisiones guardadas. Hazte Pro para guardar ilimitado y desbloquear herramientas avanzadas.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { setShowFreeLimitModal(false); setScreen(6); }}
                className="w-full rounded-xl border border-zinc-600 bg-zinc-800 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
              >
                Ver Plan Pro
              </button>
              <button
                type="button"
                onClick={() => setShowFreeLimitModal(false)}
                className="w-full rounded-xl border border-zinc-800 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-300"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="mx-auto w-full max-w-4xl" style={{ minHeight: "320px" }}>
        <AnimatePresence mode="wait">
          {screen === 1 && (
            <motion.main
              key="screen1"
              initial={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={transition}
              className="w-full rounded-3xl bg-[#0f1115] px-4 py-10 sm:px-6"
            >
              {hasSupabase && session && (
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { signOut(); setDecisions([]); }}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300 hover:border-zinc-700"
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
              <h1 className="text-center text-2xl font-medium tracking-tight text-zinc-100 sm:text-3xl">
                ¿Qué estás evitando decidir?
              </h1>

              <div className="mt-14 flex flex-col items-center gap-12">
                <div className="w-full">
                  <p className="mb-5 text-center text-base text-zinc-400 sm:text-lg">
                    ¿Qué decisión te está generando ruido hoy?
                  </p>
                  <div className="transition-transform duration-300 focus-within:scale-[1.01]">
                    <textarea
                      maxLength={200}
                      value={decisionText}
                      onChange={(e) => setDecisionText(e.target.value)}
                      placeholder="Escribe aquí lo que realmente te está costando decidir..."
                      className="min-h-[160px] w-full resize-none rounded-2xl border border-zinc-800/60 bg-zinc-900/70 px-6 py-5 text-lg leading-relaxed text-zinc-100 placeholder:text-zinc-500 placeholder:transition-opacity duration-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all duration-300 backdrop-blur-sm"
                      rows={5}
                    />
                  </div>
                </div>

                <motion.button
                  type="button"
                  onClick={handleStartAnalysis}
                  initial={false}
                  animate={{
                    opacity: decisionText.trim().length > 2 ? 1 : 0,
                    y: decisionText.trim().length > 2 ? 0 : 4,
                  }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className={`w-full max-w-sm rounded-xl border border-zinc-700/60 bg-zinc-800/50 py-3.5 text-sm font-medium tracking-wide text-zinc-200 shadow-sm transition-colors hover:border-zinc-600/80 hover:bg-zinc-700/40 ${decisionText.trim().length > 2 ? "" : "pointer-events-none"}`}
                >
                  Comenzar
                </motion.button>
              </div>

              <div className="mt-14 grid grid-cols-1 items-center justify-items-center gap-8 sm:grid-cols-3 sm:gap-8">
                <div
                  className="flex w-full max-w-[180px] flex-col items-center justify-center rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-6 py-6 sm:order-1 order-2"
                >
                  <button
                    type="button"
                    onClick={() => goToMetricDetail("claridad")}
                    className="flex flex-col items-center transition-opacity hover:opacity-90"
                  >
                    <span className="text-4xl font-light tabular-nums tracking-tight text-zinc-100">
                      {avgClarity !== null ? avgClarity : "—"}
                    </span>
                    <span className="mt-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Claridad
                    </span>
                    <span className="mt-1 text-[10px] text-zinc-500">
                      Promedio histórico
                    </span>
                  </button>
                </div>

                <div className="flex flex-col items-center justify-center sm:order-2 order-1">
                  <HubRings
                    claridad={decisions.length === 0 ? null : avgClarity}
                    confianza={confianza}
                    arrepentimiento={regretRate}
                    onClick={() => goToMetricDetail("claridad")}
                  />
                  {decisions.length === 0 && (
                    <p className="mt-4 max-w-[200px] text-center text-xs text-zinc-500">
                      Aún no hay decisiones registradas.
                    </p>
                  )}
                </div>

                <div className="flex w-full max-w-[180px] flex-col items-center justify-center rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-6 py-6 sm:order-3 order-3">
                  <button
                    type="button"
                    onClick={() => goToMetricDetail("confianza")}
                    className="flex w-full flex-col items-center border-b border-zinc-800/80 pb-5 transition-opacity hover:opacity-90"
                  >
                    <span className="text-3xl font-light tabular-nums tracking-tight text-zinc-100">
                      {confianza !== null ? confianza : "—"}
                    </span>
                    <span className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Confianza
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => goToMetricDetail("arrepentimiento")}
                    className="flex w-full flex-col items-center pt-5 transition-opacity hover:opacity-90"
                  >
                    <span className="text-3xl font-light tabular-nums tracking-tight text-zinc-100">
                      {regretRate !== null ? `${regretRate}%` : "—"}
                    </span>
                    <span className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Arrepentimiento
                    </span>
                    <span className="mt-1 text-[10px] text-zinc-500">
                      {regretRate !== null ? `${regretCount} de ${followedCount}` : "Actívalo con seguimiento"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg shadow-black/20">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Última decisión
                  </h3>
                  {lastDecision ? (
                    <>
                      <p className="mt-3 text-sm leading-relaxed text-zinc-200">
                        {truncate(lastDecision.decisionText, 80)}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {RECOMMENDATION_LABEL[lastDecision.recommendation] ??
                          lastDecision.recommendation}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500">
                      Aún no hay decisiones guardadas.
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg shadow-black/20">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Próximo paso recomendado
                  </h3>
                  {lastDecision ? (
                    <p className="mt-3 text-sm leading-relaxed text-zinc-200">
                      {lastDecision.reason ||
                        RECOMMENDATION_LABEL[lastDecision.recommendation]}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500">
                      Comienza una decisión para ver tu próximo paso.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-10 flex items-center justify-center gap-6 border-t border-zinc-800/80 pt-6">
                <span className="text-xs font-medium tracking-wide text-zinc-500">
                  Sesión {formatSession(sessionNumber)}
                </span>
                <span className="h-3 w-px bg-zinc-700/80" aria-hidden />
                <span className="text-xs font-medium tracking-wide text-zinc-500">
                  Claridad prom.: {avgClarity ?? "—"}
                </span>
              </div>
            </motion.main>
          )}

          {screen === 2 && (
            <motion.main
              key="screen2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={transition}
              className="w-full flex flex-col min-h-[320px]"
            >
              <p className="text-sm text-zinc-500">
                Decisión:{" "}
                <span className="text-zinc-300">
                  {truncate(decisionText, 50)}
                </span>
              </p>

              <div className="mt-6 flex items-center justify-center gap-2" aria-label="Progreso">
                {([1, 2, 3, 4, 5] as const).map((s) => (
                  <span
                    key={s}
                    className={`h-1.5 w-8 rounded-full transition-colors ${
                      formStage >= s ? "bg-zinc-500" : "bg-zinc-800"
                    }`}
                    aria-hidden
                  />
                ))}
              </div>

              {transitionMessage && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 text-center text-sm text-zinc-400"
                >
                  {transitionMessage}
                </motion.p>
              )}

              {stageError && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 rounded-xl bg-zinc-800/80 border border-zinc-700/60 px-4 py-2.5 text-sm text-zinc-300"
                >
                  {stageError}
                </motion.p>
              )}

              <AnimatePresence mode="wait">
                {formStage === 1 && (
                  <motion.div
                    key="stage1"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="mt-8 flex flex-1 flex-col"
                  >
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Contexto y Objetivo
                    </p>
                    <h2 className="text-lg font-medium text-zinc-100">
                      ¿Qué estás intentando lograr con esta decisión?
                    </h2>
                    <p className="mt-2 mb-4 text-sm text-zinc-400">
                      Describe con tus palabras lo que realmente importa. Esto nos ayuda a entender tu intención.
                    </p>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {(
                        [
                          { value: "compra" as const, label: "Compra" },
                          { value: "carrera" as const, label: "Carrera" },
                          { value: "relacion" as const, label: "Relación" },
                          { value: "proyecto" as const, label: "Proyecto" },
                          { value: "salud" as const, label: "Salud" },
                          { value: "otra" as const, label: "Otra" },
                        ] as const
                      ).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => { setDecisionType(value); setStageError(null); }}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                            decisionType === value
                              ? "border-zinc-500 bg-zinc-700/50 text-zinc-100"
                              : "border-zinc-700/80 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={stage1Objective}
                      onChange={(e) => { setStage1Objective(e.target.value); setStageError(null); }}
                      placeholder="Escribe tu objetivo en una frase …"
                      className="min-h-[160px] w-full resize-none rounded-2xl border border-zinc-800/60 bg-zinc-900/70 px-5 py-4 text-lg leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      rows={5}
                    />
                    <p className="mt-3 text-xs text-zinc-500">
                      No te preocupes si te toma tiempo — esto es pensamiento, no velocidad.
                    </p>
                    <div className="mt-auto pt-8">
                      <motion.button
                        type="button"
                        onClick={handleStage1Next}
                        whileTap={{ scale: 0.98 }}
                        disabled={!stage1Objective.trim()}
                        className="w-full border border-zinc-600/60 bg-zinc-800/40 py-3.5 text-sm font-medium tracking-wide text-zinc-200 transition-colors hover:border-zinc-500/80 hover:bg-zinc-700/30 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-800/40"
                      >
                        Siguiente
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {formStage === 2 && (
                  <motion.div
                    key="stage2"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="mt-8 flex flex-1 flex-col"
                  >
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Alternativas
                    </p>
                    <h2 className="text-lg font-medium text-zinc-100">
                      ¿Qué otras opciones consideraste?
                    </h2>
                    <p className="mt-2 mb-4 text-sm text-zinc-400">
                      Piensa en todas las posibilidades — incluso «no hacer nada».
                    </p>
                    <div className="space-y-3">
                      {stage2Alternatives.map((alt, i) => (
                        <input
                          key={i}
                          type="text"
                          value={alt}
                          onChange={(e) => {
                            const next = [...stage2Alternatives];
                            next[i] = e.target.value;
                            setStage2Alternatives(next);
                            setStageError(null);
                          }}
                          placeholder={`Alternativa ${i + 1}…`}
                          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      ))}
                    </div>
                    {stage2Alternatives.length < 5 && (
                      <button
                        type="button"
                        onClick={() => setStage2Alternatives((prev) => [...prev, ""])}
                        className="mt-3 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                      >
                        + Agregar alternativa
                      </button>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(profile?.role === "pro" || !hasSupabase) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setAiHelperPrompt(buildIAHelperPrompt("alternativas", {
                              decisionText,
                              stage1Objective,
                              stage2Alternatives,
                              stage3EvidenceFor: "",
                              stage3EvidenceMissing: "",
                              stage4Cost: stage4Cost,
                              stage4Reversibility: stage4Reversibility,
                              stage5State,
                            }))}
                            className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700/60 rounded-lg px-3 py-1.5 transition-colors"
                          >
                            Ayúdame a sugerir alternativas
                          </button>
                          <button
                            type="button"
                            onClick={() => setAiHelperPrompt(buildIAHelperPrompt("detectar_sesgos", {
                              decisionText,
                              stage1Objective,
                              stage2Alternatives,
                              stage3EvidenceFor: "",
                              stage3EvidenceMissing: "",
                              stage4Cost: stage4Cost,
                              stage4Reversibility: stage4Reversibility,
                              stage5State,
                            }))}
                            className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700/60 rounded-lg px-3 py-1.5 transition-colors"
                          >
                            Detectar sesgos
                          </button>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500" title="Función Pro — pronto disponible.">
                          <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          Función Pro — pronto disponible.
                        </span>
                      )}
                    </div>
                    <div className="mt-auto pt-8">
                      <motion.button
                        type="button"
                        onClick={handleStage2Next}
                        whileTap={{ scale: 0.98 }}
                        className="w-full border border-zinc-600/60 bg-zinc-800/40 py-3.5 text-sm font-medium tracking-wide text-zinc-200 transition-colors hover:border-zinc-500/80 hover:bg-zinc-700/30 rounded-xl"
                      >
                        Siguiente
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {formStage === 3 && (
                  <motion.div
                    key="stage3"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="mt-8 flex flex-1 flex-col"
                  >
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Evidencia
                    </p>
                    <h2 className="text-lg font-medium text-zinc-100">
                      ¿Qué información tienes a favor y qué falta por confirmar?
                    </h2>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-400">
                          A favor
                        </label>
                        <textarea
                          value={stage3EvidenceFor}
                          onChange={(e) => { setStage3EvidenceFor(e.target.value); setStageError(null); }}
                          placeholder="Escribe datos o señales que respaldan tu idea…"
                          className="min-h-[88px] w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-400">
                          Falta por confirmar
                        </label>
                        <textarea
                          value={stage3EvidenceMissing}
                          onChange={(e) => { setStage3EvidenceMissing(e.target.value); setStageError(null); }}
                          placeholder="Escribe lo que todavía no sabes bien…"
                          className="min-h-[88px] w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          rows={3}
                        />
                      </div>
                    </div>
                    {(profile?.role === "pro" || !hasSupabase) ? (
                      <button
                        type="button"
                        onClick={() => setAiHelperPrompt(buildIAHelperPrompt("resumir_evidencia", {
                          decisionText,
                          stage1Objective,
                          stage2Alternatives,
                          stage3EvidenceFor,
                          stage3EvidenceMissing,
                          stage4Cost: stage4Cost,
                          stage4Reversibility: stage4Reversibility,
                          stage5State,
                        }))}
                        className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700/60 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Resumir evidencia
                      </button>
                    ) : (
                      <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-500" title="Función Pro — pronto disponible.">
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        Función Pro — pronto disponible.
                      </span>
                    )}
                    <div className="mt-auto pt-8">
                      <motion.button
                        type="button"
                        onClick={handleStage3Next}
                        whileTap={{ scale: 0.98 }}
                        className="w-full border border-zinc-600/60 bg-zinc-800/40 py-3.5 text-sm font-medium tracking-wide text-zinc-200 transition-colors hover:border-zinc-500/80 hover:bg-zinc-700/30 rounded-xl"
                      >
                        Siguiente
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {formStage === 4 && (
                  <motion.div
                    key="stage4"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="mt-8 flex flex-1 flex-col"
                  >
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Riesgos y Consecuencias
                    </p>
                    <h2 className="text-lg font-medium text-zinc-100">
                      ¿Qué pasa si sale mal?
                    </h2>
                    <p className="mt-2 mb-5 text-sm text-zinc-400">
                      Este paso es clave para decidir con seguridad.
                    </p>
                    <p className="mb-2 text-sm font-medium text-zinc-300">
                      Costo de error
                    </p>
                    <div className="mb-6 flex flex-col gap-2">
                      {(
                        [
                          { value: "bajo" as const, label: "Bajo — Si sale mal, no afecta mucho." },
                          { value: "medio" as const, label: "Medio — Duele, pero manejable." },
                          { value: "alto" as const, label: "Alto — Tiene impacto serio si sale mal." },
                        ] as const
                      ).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setStage4Cost(value)}
                          className={`rounded-xl border py-3 px-4 text-left text-sm transition-colors ${
                            stage4Cost === value
                              ? "border-zinc-500 bg-zinc-700/50 text-zinc-100"
                              : "border-zinc-700/80 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mb-2 text-sm font-medium text-zinc-300">
                      Reversibilidad
                    </p>
                    <div className="flex flex-col gap-2">
                      {(
                        [
                          { value: "reversible" as const, label: "Fácil — Se puede revertir sin problema." },
                          { value: "semi" as const, label: "Medio — Se puede, pero con esfuerzo." },
                          { value: "irreversible" as const, label: "Difícil — No se puede revertir bien." },
                        ] as const
                      ).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setStage4Reversibility(value)}
                          className={`rounded-xl border py-3 px-4 text-left text-sm transition-colors ${
                            stage4Reversibility === value
                              ? "border-zinc-500 bg-zinc-700/50 text-zinc-100"
                              : "border-zinc-700/80 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-auto pt-8">
                      <motion.button
                        type="button"
                        onClick={handleStage4Next}
                        whileTap={{ scale: 0.98 }}
                        className="w-full border border-zinc-600/60 bg-zinc-800/40 py-3.5 text-sm font-medium tracking-wide text-zinc-200 transition-colors hover:border-zinc-500/80 hover:bg-zinc-700/30 rounded-xl"
                      >
                        Siguiente
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {formStage === 5 && (
                  <motion.div
                    key="stage5"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="mt-8 flex flex-1 flex-col"
                  >
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Estado Interno
                    </p>
                    <h2 className="text-lg font-medium text-zinc-100">
                      ¿Cómo te sientes mientras piensas esto?
                    </h2>
                    <div className="mt-5 flex flex-col gap-2">
                      {(
                        [
                          { value: "calmado" as const, label: "Calma", desc: "Estoy tranquilo." },
                          { value: "bajo presion" as const, label: "Bajo presión", desc: "Siento urgencia o ansiedad leve." },
                          { value: "ansioso" as const, label: "Ansioso", desc: "Me cuesta pensar con claridad." },
                        ] as const
                      ).map(({ value, label, desc }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setStage5State(value)}
                          className={`rounded-2xl border py-4 px-4 text-left transition-colors ${
                            stage5State === value
                              ? "border-zinc-500 bg-zinc-700/50 text-zinc-100"
                              : "border-zinc-700/80 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                          }`}
                        >
                          <span className="font-medium">{label}</span>
                          <span className="block mt-0.5 text-sm font-normal opacity-90">— {desc}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-auto pt-8">
                      <motion.button
                        type="button"
                        onClick={handleGuidedResult}
                        whileTap={{ scale: 0.98 }}
                        className="w-full border border-zinc-600/60 bg-zinc-800/40 py-3.5 text-sm font-medium tracking-wide text-zinc-200 transition-colors hover:border-zinc-500/80 hover:bg-zinc-700/30 rounded-xl"
                      >
                        Ver resultado
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-6 flex items-center justify-center gap-6 border-t border-zinc-800/80 pt-6">
                <span className="text-xs font-medium tracking-wide text-zinc-500">
                  Sesión {formatSession(sessionNumber)}
                </span>
                <span className="h-3 w-px bg-zinc-700/80" aria-hidden />
                <span className="text-xs font-medium tracking-wide text-zinc-500">
                  Claridad prom.: {avgClarity ?? "—"}
                </span>
              </div>
            </motion.main>
          )}

          {screen === 3 && (
            <motion.main
              key="screen3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={transition}
              className="w-full"
            >
              <div className="text-center">
                <p className="text-5xl font-light tabular-nums tracking-tight text-zinc-100 sm:text-6xl">
                  {score}
                </p>
                {levelFromScore(score) && (
                  <p className="mt-2 text-sm text-zinc-500">
                    Nivel: {levelFromScore(score)}
                  </p>
                )}

                <div className="mt-10 max-w-sm mx-auto text-left space-y-6">
                  {(() => {
                    const playbook = getPlaybook(recommendation, decisionType);
                    const actionPhrase = ACTION_FRIENDLY_PHRASE[recommendation] ?? playbook.actionTitle;
                    const firstStep = FIRST_STEP_SUGGESTION[recommendation] ?? playbook.nextStep;
                    const nextSteps = [firstStep, ...playbook.playbookSteps].filter(Boolean);
                    return (
                      <>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Diagnóstico</p>
                          <p className="mt-1 text-sm text-zinc-300">{playbook.diagnosis}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Acción recomendada</p>
                          <p className="mt-1 text-sm font-medium text-zinc-200">{actionPhrase}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Por qué</p>
                          <p className="mt-1 text-sm text-zinc-400">{reason}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Próximos pasos</p>
                          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-400">
                            {nextSteps.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2">
                          {(profile?.role === "pro" || !hasSupabase) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setAiHelperPrompt(buildIAHelperPrompt("mejorar_why", {
                                  decisionText,
                                  stage1Objective,
                                  stage2Alternatives,
                                  stage3EvidenceFor,
                                  stage3EvidenceMissing,
                                  stage4Cost: stage4Cost,
                                  stage4Reversibility: stage4Reversibility,
                                  stage5State,
                                }))}
                                className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700/60 rounded-lg px-3 py-1.5 transition-colors"
                              >
                                Mejorar WHY
                              </button>
                              <button
                                type="button"
                                onClick={() => setAiHelperPrompt(buildIAHelperPrompt("frases_motivadoras", {
                                  decisionText,
                                  stage1Objective,
                                  stage2Alternatives,
                                  stage3EvidenceFor,
                                  stage3EvidenceMissing,
                                  stage4Cost: stage4Cost,
                                  stage4Reversibility: stage4Reversibility,
                                  stage5State,
                                  recommendation,
                                  firstStep: FIRST_STEP_SUGGESTION[recommendation],
                                }))}
                                className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700/60 rounded-lg px-3 py-1.5 transition-colors"
                              >
                                Frases motivadoras
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500" title="Función Pro — pronto disponible.">
                              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                              Función Pro — pronto disponible.
                            </span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {recommendation === "ESPERAR_7_DIAS" && (
                <div className="mt-8 max-w-sm mx-auto">
                  <CheckInCard
                    createdAt={new Date().toISOString()}
                    onSaveCheckIn={(data) =>
                      setCheckInByDecisionId((prev) => ({ ...prev, current: data }))
                    }
                    existingCheckIn={checkInByDecisionId["current"] ?? null}
                  />
                </div>
              )}

              {resultDraftPlan && (
                <div className="mt-8 w-full max-w-sm mx-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Plan de acción
                    </h3>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {resultDraftPlan.items.filter((i) => i.done).length} de {resultDraftPlan.items.length} completados
                    </span>
                  </div>
                  <div className="mt-3 h-1 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{
                        width: `${(resultDraftPlan.items.filter((i) => i.done).length / resultDraftPlan.items.length) * 100}%`,
                      }}
                    />
                  </div>
                  <ul className="mt-4 space-y-2">
                    {resultDraftPlan.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 rounded-xl py-2 px-3 hover:bg-zinc-800/50">
                        <button
                          type="button"
                          onClick={() => {
                            setResultDraftPlan((prev) => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                items: prev.items.map((i) =>
                                  i.id === item.id ? { ...i, done: !i.done } : i
                                ),
                                updatedAt: new Date().toISOString(),
                              };
                            });
                          }}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            item.done ? "border-emerald-500 bg-emerald-500" : "border-zinc-600 bg-transparent"
                          }`}
                        >
                          {item.done ? (
                            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : null}
                        </button>
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) => {
                            setResultDraftPlan((prev) => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                items: prev.items.map((i) =>
                                  i.id === item.id ? { ...i, text: e.target.value } : i
                                ),
                                updatedAt: new Date().toISOString(),
                              };
                            });
                          }}
                          className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${item.done ? "text-zinc-500 line-through opacity-70" : "text-zinc-100"}`}
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        if (!resultDraftPlan || resultDraftPlan.items.length >= 5) return;
                        setResultDraftPlan((prev) => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            items: [...prev.items, { id: genId(), text: "", done: false }],
                            updatedAt: new Date().toISOString(),
                          };
                        });
                      }}
                      disabled={!resultDraftPlan || resultDraftPlan.items.length >= 5}
                      className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                    >
                      + Agregar paso
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultDraftPlan(getDefaultActionPlanTemplate(recommendation))}
                      className="text-xs text-zinc-500 hover:text-zinc-400"
                    >
                      Restaurar plantilla
                    </button>
                  </div>
                </div>
              )}

              {isDemoMode ? (
                <div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                  {demoEmailSuccess ? (
                    <>
                      <p className="text-center text-lg font-medium text-zinc-100">
                        Listo ✅ Revisa tu correo (demo)
                      </p>
                      <p className="mt-2 text-center text-sm text-zinc-400">
                        Te mandamos tu diagnóstico y próximos pasos. Sin spam.
                      </p>
                      <a
                        href="/auth/login"
                        className="mt-6 block w-full rounded-2xl border border-zinc-600 bg-zinc-100 py-3.5 text-center text-sm font-medium text-zinc-900 transition hover:bg-white"
                      >
                        Crear cuenta para guardar historial
                      </a>
                    </>
                  ) : (
                    <>
                      <h3 className="text-center text-base font-medium text-zinc-100">
                        ¿Te lo envío por correo?
                      </h3>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!demoEmail.trim() || demoEmailSubmitting) return;
                          setDemoEmailSubmitting(true);
                          const { error } = await insertLead({
                            email: demoEmail.trim(),
                            decision_text: decisionText,
                            score,
                            recommendation,
                            reason_text: reason,
                          });
                          setDemoEmailSubmitting(false);
                          if (!error) setDemoEmailSuccess(true);
                          else {
                            setToastError("No se pudo enviar. Reintenta.");
                            setTimeout(() => setToastError(null), 3000);
                          }
                        }}
                        className="mt-4 space-y-3"
                      >
                        <input
                          type="email"
                          value={demoEmail}
                          onChange={(e) => setDemoEmail(e.target.value)}
                          placeholder="tu@correo.com"
                          required
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                        />
                        <button
                          type="submit"
                          disabled={demoEmailSubmitting}
                          className="w-full rounded-2xl border border-zinc-600 bg-zinc-100 py-3.5 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:opacity-60"
                        >
                          {demoEmailSubmitting ? "Enviando…" : "Enviar resultados"}
                        </button>
                      </form>
                      <p className="mt-3 text-center text-xs text-zinc-500">
                        Te mandamos tu diagnóstico y próximos pasos. Sin spam.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="mt-12 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={handleSaveDecision}
                      className="w-full border border-zinc-600/60 bg-zinc-800/40 py-3.5 text-sm font-medium tracking-wide text-zinc-200 transition-colors hover:border-zinc-500/80 hover:bg-zinc-700/30"
                    >
                      Guardar decisión
                    </button>
                    <button
                      type="button"
                      onClick={() => setScreen(2)}
                      className="w-full py-3 text-sm font-medium tracking-wide text-zinc-500 transition-colors hover:text-zinc-400"
                    >
                      Atrás
                    </button>
                  </div>

                  <div className="mt-8 flex flex-col items-center gap-2 border-t border-zinc-800/80 pt-6">
                    <div className="flex items-center justify-center gap-6">
                      <span className="text-xs font-medium tracking-wide text-zinc-500">
                        Sesión {formatSession(sessionNumber)}
                      </span>
                      <span className="h-3 w-px bg-zinc-700/80" aria-hidden />
                      <span className="text-xs font-medium tracking-wide text-zinc-500">
                        Claridad prom.: {avgClarity ?? "—"}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600">
                      Confianza del sistema: {getSystemConfidence(decisions.length)}
                    </p>
                  </div>
                </>
              )}

              {isDemoMode && (
                <div className="mt-8">
                  <button
                    type="button"
                    onClick={() => setScreen(2)}
                    className="w-full py-3 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-400"
                  >
                    Atrás
                  </button>
                </div>
              )}
            </motion.main>
          )}

          {screen === 4 && (
            <motion.main
              key="screen4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={transition}
              className="w-full rounded-3xl bg-zinc-950 px-1"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setScreen(1)}
                  className="py-2 pr-4 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-300"
                >
                  ← Atrás
                </button>
              </div>

              <header className="mt-2">
                <h1 className="text-2xl font-medium tracking-tight text-zinc-100 sm:text-3xl">
                  Métricas
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  Entiende cómo estás decidiendo y por qué.
                </p>
              </header>

              <section className="mt-12 flex flex-col items-center" aria-label="Control hub">
                <div className="scale-110">
                  <HubRings
                    claridad={decisions.length === 0 ? null : avgClarity}
                    confianza={confianza}
                    arrepentimiento={regretRate}
                  />
                </div>
                <h2 className="mt-8 text-xl font-medium tracking-tight text-zinc-100">
                  Claridad
                </h2>
                {levelFromScore(avgClarity) && (
                  <p className="mt-2 text-sm font-medium text-zinc-400">
                    {levelFromScore(avgClarity)}
                  </p>
                )}
                <p className="mt-3 text-sm text-zinc-500">
                  Promedio de tus decisiones recientes
                </p>
              </section>

              <section className="mt-16" aria-label="Diagnóstico rápido">
                <h2 className="mb-5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Diagnóstico rápido
                </h2>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setMetricDetail("claridad")}
                    className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left shadow-sm transition active:scale-[0.99] ${metricDetail === "claridad" ? "border-zinc-600" : "hover:border-zinc-700"}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="shrink-0">
                        <RingMetric
                          score={avgClarity}
                          size={80}
                          label="Claridad"
                          sublabel=""
                          hideLabel
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-2xl font-light tabular-nums text-zinc-100">
                          {avgClarity !== null ? avgClarity : "—"}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Claridad
                        </p>
                        {levelFromScore(avgClarity) && (
                          <p className="mt-1.5 text-xs font-medium text-zinc-400">
                            {levelFromScore(avgClarity)}
                          </p>
                        )}
                        <p className="mt-2.5 text-xs leading-snug text-zinc-500">
                          {interpretationClaridad(avgClarity)}
                        </p>
                        {claritySeries.length > 0 && (
                          <div className="mt-3 flex items-center gap-3 text-blue-400">
                            <span aria-hidden>
                              <Sparkline values={claritySeries} />
                            </span>
                            {formatDelta(clarityDelta) !== null && (
                              <span className="text-xs tabular-nums text-blue-400/90">
                                {trendCount} decisiones: {formatDelta(clarityDelta)}
                              </span>
                            )}
                          </div>
                        )}
                        <span className="mt-3 inline-block text-xs font-medium text-zinc-400">
                          Ver detalle →
                        </span>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMetricDetail("confianza")}
                    className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left shadow-sm transition active:scale-[0.99] ${metricDetail === "confianza" ? "border-zinc-600" : "hover:border-zinc-700"}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="shrink-0">
                        <RingMetric
                          score={confianza}
                          size={80}
                          label="Confianza"
                          sublabel=""
                          hideLabel
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-2xl font-light tabular-nums text-zinc-100">
                          {confianza !== null ? confianza : "—"}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Confianza
                        </p>
                        {levelFromScore(confianza) && (
                          <p className="mt-1.5 text-xs font-medium text-zinc-400">
                            {levelFromScore(confianza)}
                          </p>
                        )}
                        <p className="mt-2.5 text-xs leading-snug text-zinc-500">
                          {interpretationConfianza(confianza)}
                        </p>
                        {confidenceSeries.length > 0 && (
                          <div className="mt-3 flex items-center gap-3 text-emerald-400">
                            <span aria-hidden>
                              <Sparkline values={confidenceSeries} />
                            </span>
                            {formatDelta(confidenceDelta) !== null && (
                              <span className="text-xs tabular-nums text-emerald-400/90">
                                {trendCount} decisiones: {formatDelta(confidenceDelta)}
                              </span>
                            )}
                          </div>
                        )}
                        <span className="mt-3 inline-block text-xs font-medium text-zinc-400">
                          Ver detalle →
                        </span>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMetricDetail("arrepentimiento")}
                    className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left shadow-sm transition active:scale-[0.99] ${metricDetail === "arrepentimiento" ? "border-zinc-600" : "hover:border-zinc-700"}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="shrink-0">
                        <RingMetric
                          score={regretRate}
                          size={80}
                          label="Arrepentimiento"
                          sublabel=""
                          emptyState={regretRate === null}
                          hideLabel
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-2xl font-light tabular-nums text-zinc-100">
                          {regretRate !== null ? `${regretRate}%` : "—"}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Arrepentimiento
                        </p>
                        {regretRate !== null && (
                          <p className="mt-1 text-xs text-violet-400">
                            {regretCount} de {followedCount}
                          </p>
                        )}
                        {levelFromRegretRate(regretRate) && (
                          <p className="mt-1.5 text-xs font-medium text-zinc-400">
                            {levelFromRegretRate(regretRate)}
                          </p>
                        )}
                        <p className="mt-2.5 text-xs leading-snug text-zinc-500">
                          {interpretationArrepentimiento(regretRate)}
                        </p>
                        {regretRate !== null && (
                          <p className="mt-1 text-xs text-violet-400/90">
                            Basado en seguimientos.
                          </p>
                        )}
                        <span className="mt-3 inline-block text-xs font-medium text-zinc-400">
                          Ver detalle →
                        </span>
                      </div>
                    </div>
                  </button>
                </div>
              </section>

              <section className="mt-16 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm" aria-label="Motor explicado">
                <h2 className="text-sm font-medium tracking-tight text-zinc-200">
                  Cómo funciona tu recomendación
                </h2>
                <ul className="mt-6 space-y-4 text-sm text-zinc-400">
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                    <span>Difícil de revertir + costo alto → Preparar plan.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                    <span>Energía muy negativa → Esperar 7 días.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                    <span>Convicción alta + costo bajo → Actuar hoy (paso pequeño).</span>
                  </li>
                </ul>
              </section>

              <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm" aria-label="Mejora accionable">
                <h2 className="text-sm font-medium tracking-tight text-zinc-200">
                  Qué mejorar esta semana
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                  {tipForMetric(lowestMetric(avgClarity, confianza), avgClarity, confianza)}
                </p>
              </section>

              <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm" aria-label="Insight de la semana">
                <h2 className="text-sm font-medium tracking-tight text-zinc-200">
                  Insight de la semana
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                  {getWeeklyInsight(clarityDelta, confidenceDelta, regretRate)}
                </p>
              </section>

              {metricDetail && (
                <section
                  className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm"
                  aria-label={`Detalle: ${metricDetail}`}
                >
                  {metricDetail === "claridad" && (
                    <>
                      <p className="text-4xl font-light tabular-nums text-zinc-100">
                        {avgClarity !== null ? avgClarity : "—"}
                      </p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Claridad
                      </p>
                      {levelFromScore(avgClarity) && (
                        <p className="mt-2 text-sm font-medium text-zinc-300">
                          Nivel: {levelFromScore(avgClarity)}
                        </p>
                      )}
                      <div className="mt-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Lectura rápida
                        </p>
                        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-400">
                          {avgClarity !== null && avgClarity >= 70 && (
                            <>
                              <li>Tus decisiones tienden a ser coherentes.</li>
                              <li>Buen momento para seguir actuando con pasos pequeños.</li>
                            </>
                          )}
                          {avgClarity !== null && avgClarity >= 45 && avgClarity < 70 && (
                            <>
                              <li>Hay espacio para ganar claridad.</li>
                              <li>Revisar reversibilidad y costo ayuda.</li>
                            </>
                          )}
                          {avgClarity !== null && avgClarity < 45 && (
                            <>
                              <li>Conviene bajar la duda antes de decidir.</li>
                              <li>Esperar 7 días suele mejorar el resultado.</li>
                            </>
                          )}
                          {avgClarity === null && (
                            <li>Registra decisiones para ver tu lectura.</li>
                          )}
                        </ul>
                      </div>
                      <div className="mt-5">
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Cómo se calcula
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          Promedio del resultado de cada decisión que guardas, según
                          convicción, costo si sale mal y energía. Un número alto
                          indica más coherencia entre lo que eliges y lo que
                          valoras.
                        </p>
                      </div>
                      <div className="mt-5">
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Qué mejorar esta semana
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          {avgClarity !== null && avgClarity >= 70
                            ? "Mantén el ritmo: una decisión pequeña por semana."
                            : avgClarity !== null && avgClarity >= 45
                              ? "Antes de decidir, escribe en una línea qué pasaría si te equivocas."
                              : "Elige una sola decisión pendiente y date 7 días antes de actuar."}
                        </p>
                      </div>
                      <div className="mt-6">
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Últimas decisiones
                        </p>
                        <ul className="mt-3 space-y-2">
                          {decisions.slice(0, 7).map((d) => (
                            <li
                              key={d.id}
                              className="flex items-baseline justify-between gap-2 border-b border-zinc-800/80 pb-2 text-sm last:border-0"
                            >
                              <span className="tabular-nums text-zinc-300">
                                {d.score}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-zinc-400">
                                {truncate(d.decisionText, 35)}
                              </span>
                              <span className="shrink-0 text-xs text-zinc-500">
                                {RECOMMENDATION_LABEL[d.recommendation] ?? d.recommendation}
                              </span>
                            </li>
                          ))}
                          {decisions.length === 0 && (
                            <li className="text-sm text-zinc-500">
                              Aún no hay decisiones guardadas.
                            </li>
                          )}
                        </ul>
                      </div>
                    </>
                  )}

                  {metricDetail === "confianza" && (
                    <>
                      <p className="text-4xl font-light tabular-nums text-zinc-100">
                        {confianza !== null ? confianza : "—"}
                      </p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Confianza
                      </p>
                      {levelFromScore(confianza) && (
                        <p className="mt-2 text-sm font-medium text-zinc-300">
                          Nivel: {levelFromScore(confianza)}
                        </p>
                      )}
                      {avgDoubt !== null && (
                        <p className="mt-2 text-sm text-zinc-400">
                          Duda promedio: {avgDoubt.toFixed(1)} / 10
                        </p>
                      )}
                      <div className="mt-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Explicación
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          Confianza sube cuando tu duda promedio baja. Menos
                          duda al decidir suele traducirse en más cierre y menos
                          rumiación.
                        </p>
                      </div>
                      <div className="mt-5">
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                          Qué mejorar esta semana
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          Reduce la incertidumbre: anota qué información te
                          falta y define un criterio claro antes de decidir.
                        </p>
                      </div>
                    </>
                  )}

                  {metricDetail === "arrepentimiento" && (
                    <>
                      <p className="text-4xl font-light tabular-nums text-zinc-100">
                        {regretRate !== null ? `${regretRate}%` : "—"}
                      </p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Arrepentimiento
                      </p>
                      {levelFromRegretRate(regretRate) && (
                        <p className="mt-2 text-sm font-medium text-zinc-300">
                          Nivel: {levelFromRegretRate(regretRate)}
                        </p>
                      )}
                      <p className="mt-4 text-sm text-zinc-400">
                        Cuántas decisiones lamentas con el tiempo.
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        Basado en tus seguimientos.
                      </p>
                      {regretRate === null && (
                        <p className="mt-4 text-sm text-zinc-400">
                          Guarda decisiones y completa el seguimiento («¿Te arrepientes?») para activar esta métrica.
                        </p>
                      )}
                    </>
                  )}
                </section>
              )}

            </motion.main>
          )}

          {screen === 5 && (
            <motion.main
              key="screen5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={transition}
              className="w-full rounded-3xl bg-[#0f1115] px-4 py-6 sm:px-6"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => (selectedDecision ? setSelectedDecision(null) : setScreen(1))}
                  className="py-2 pr-4 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-300"
                >
                  ← {selectedDecision ? "Historial" : "Inicio"}
                </button>
              </div>

              {!selectedDecision ? (
                <>
                  <h1 className="mt-4 text-2xl font-medium tracking-tight text-zinc-100">
                    Historial
                  </h1>
                  <p className="mt-1 text-sm text-zinc-500">
                    Aquí puedes revisar, editar o hacer seguimiento.
                  </p>
                  <ul className="mt-8 space-y-4">
                    {decisionsLoading ? (
                      <li className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center text-sm text-zinc-500">
                        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-400" aria-hidden />{" "}
                        Cargando decisiones…
                      </li>
                    ) : decisions.length === 0 ? (
                      <li className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center text-sm text-zinc-500">
                        Aún no hay decisiones guardadas.
                      </li>
                    ) : (
                      decisions.map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDecision(d);
                              setEditingFollowUp(false);
                              setFollowUpForm(
                                d.followUp
                                  ? {
                                      actionTaken: d.followUp.actionTaken,
                                      regret: d.followUp.regret,
                                      outcome: d.followUp.outcome,
                                    }
                                  : { actionTaken: "actue", regret: false, outcome: "igual" }
                              );
                            }}
                            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left transition hover:border-zinc-700"
                          >
                            <p className="text-zinc-200 line-clamp-2">
                              {truncate(d.decisionText, 60)}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                              <span>{formatFriendlyDate(d.createdAt)}</span>
                              <span className="tabular-nums text-zinc-400">
                                {d.score}
                              </span>
                              <span>
                                {RECOMMENDATION_LABEL[d.recommendation] ?? d.recommendation}
                              </span>
                            </div>
                            <span
                              className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${d.followUp ? "bg-zinc-700/60 text-zinc-300" : "bg-zinc-800/80 text-zinc-500"}`}
                            >
                              {d.followUp ? "Cerrada" : "Pendiente"}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </>
              ) : (
                <div className="mt-6 space-y-8">
                  <div>
                    <h2 className="text-lg font-medium text-zinc-100">
                      Decisión guardada
                    </h2>
                    <p className="mt-2 text-zinc-300 leading-relaxed">
                      {selectedDecision.decisionText}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {formatFriendlyDate(selectedDecision.createdAt)}
                    </p>
                    <div className="mt-4 flex flex-wrap items-baseline gap-4">
                      <span className="text-2xl font-light tabular-nums text-zinc-100">
                        {selectedDecision.score}
                      </span>
                      <span className="text-sm text-zinc-400">
                        {RECOMMENDATION_LABEL[selectedDecision.recommendation] ??
                          selectedDecision.recommendation}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-zinc-500">
                      {selectedDecision.reason}
                    </p>
                  </div>

                  {selectedDecision.recommendation === "ESPERAR_7_DIAS" && (
                    <div className="max-w-sm">
                      <CheckInCard
                        createdAt={selectedDecision.createdAt}
                        onSaveCheckIn={(data) =>
                          setCheckInByDecisionId((prev) => ({
                            ...prev,
                            [selectedDecision.id]: data,
                          }))
                        }
                        existingCheckIn={checkInByDecisionId[selectedDecision.id] ?? null}
                      />
                    </div>
                  )}

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Resumen
                    </h3>
                    {(() => {
                      const disp = getInputDisplay(selectedDecision.input);
                      return (
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                          <div>
                            <dt className="text-zinc-500">Convicción</dt>
                            <dd className="tabular-nums text-zinc-200">{disp.conviccion}</dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500">Costo</dt>
                            <dd className="tabular-nums text-zinc-200">{disp.costo}</dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500">Energía</dt>
                            <dd className="tabular-nums text-zinc-200">{disp.energia}</dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500">Reversibilidad</dt>
                            <dd className="text-zinc-200">{disp.reversibilidad}</dd>
                          </div>
                        </dl>
                      );
                    })()}
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Seguimiento
                    </h3>

                    {followUpSavedMessage && (
                      <p className="mt-3 text-sm text-zinc-400">
                        Seguimiento guardado.
                      </p>
                    )}

                    {selectedDecision.followUp && !editingFollowUp ? (
                      <div className="mt-4 space-y-3 text-sm">
                        <p className="text-zinc-400">
                          <span className="text-zinc-500">Qué hiciste: </span>
                          {ACTION_TAKEN_LABEL[selectedDecision.followUp.actionTaken]}
                        </p>
                        <p className="text-zinc-400">
                          <span className="text-zinc-500">¿Te arrepientes? </span>
                          {selectedDecision.followUp.regret ? "Sí" : "No"}
                        </p>
                        <p className="text-zinc-400">
                          <span className="text-zinc-500">Resultado: </span>
                          {OUTCOME_LABEL[selectedDecision.followUp.outcome]}
                        </p>
                        <button
                          type="button"
                          onClick={() => setEditingFollowUp(true)}
                          className="mt-4 text-sm font-medium text-zinc-400 hover:text-zinc-300"
                        >
                          Editar seguimiento
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-6">
                        <div>
                          <p className="mb-2 text-sm text-zinc-400">
                            ¿Qué hiciste finalmente?
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(
                              [
                                { value: "actue" as const, label: "Actué" },
                                { value: "espere" as const, label: "Esperé" },
                                { value: "descarte" as const, label: "Lo descarté" },
                              ] as const
                            ).map(({ value, label }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  setFollowUpForm((f) => ({ ...f, actionTaken: value }))
                                }
                                className={`rounded-xl border px-4 py-2 text-sm transition ${
                                  followUpForm.actionTaken === value
                                    ? "border-zinc-600 bg-zinc-700/50 text-zinc-100"
                                    : "border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-sm text-zinc-400">
                            ¿Te arrepientes?
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setFollowUpForm((f) => ({ ...f, regret: true }))
                              }
                              className={`rounded-xl border px-4 py-2 text-sm transition ${
                                followUpForm.regret
                                  ? "border-zinc-600 bg-zinc-700/50 text-zinc-100"
                                  : "border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700"
                              }`}
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setFollowUpForm((f) => ({ ...f, regret: false }))
                              }
                              className={`rounded-xl border px-4 py-2 text-sm transition ${
                                !followUpForm.regret
                                  ? "border-zinc-600 bg-zinc-700/50 text-zinc-100"
                                  : "border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700"
                              }`}
                            >
                              No
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-sm text-zinc-400">
                            Resultado hasta ahora
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(
                              [
                                { value: "mejor" as const, label: "Mejor" },
                                { value: "igual" as const, label: "Igual" },
                                { value: "peor" as const, label: "Peor" },
                              ] as const
                            ).map(({ value, label }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  setFollowUpForm((f) => ({ ...f, outcome: value }))
                                }
                                className={`rounded-xl border px-4 py-2 text-sm transition ${
                                  followUpForm.outcome === value
                                    ? "border-zinc-600 bg-zinc-700/50 text-zinc-100"
                                    : "border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:border-zinc-700"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => saveFollowUp(selectedDecision.id)}
                          className="rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700/50"
                        >
                          Guardar seguimiento
                        </button>
                      </div>
                    )}
                  </div>

                  {selectedDecision.followUp && (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Decision Replay
                      </h3>
                      <dl className="mt-4 space-y-3 text-sm">
                        <div>
                          <dt className="text-zinc-500">Recomendación del sistema:</dt>
                          <dd className="mt-0.5 text-zinc-200">
                            {ACTION_MODE_LABEL[selectedDecision.recommendation] ??
                              selectedDecision.recommendation}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-zinc-500">Lo que hiciste:</dt>
                          <dd className="mt-0.5 text-zinc-200">
                            {ACTION_TAKEN_LABEL[selectedDecision.followUp.actionTaken]}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-zinc-500">Resultado:</dt>
                          <dd className="mt-0.5 text-zinc-200">
                            {OUTCOME_LABEL[selectedDecision.followUp.outcome]}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-4 pt-4 border-t border-zinc-800 text-sm text-zinc-400">
                        {getReplayEvaluationText(
                          selectedDecision.recommendation,
                          selectedDecision.followUp.actionTaken,
                          selectedDecision.followUp.outcome
                        )}
                      </p>
                    </div>
                  )}

                  <div
                    className={`rounded-3xl border bg-zinc-900 p-6 shadow-lg transition-colors ${
                      selectedDecision.actionPlan?.items.length
                        ? selectedDecision.actionPlan.items.every((i) => i.done)
                          ? "border border-emerald-500/40"
                          : "border border-zinc-800"
                        : "border border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                        Plan de acción
                      </h3>
                      {selectedDecision.actionPlan && selectedDecision.actionPlan.items.length > 0 && (
                        <span className="text-xs text-zinc-500 tabular-nums">
                          {selectedDecision.actionPlan.items.filter((i) => i.done).length} de{" "}
                          {selectedDecision.actionPlan.items.length} completados
                        </span>
                      )}
                    </div>

                    {selectedDecision.actionPlan && selectedDecision.actionPlan.items.length > 0 && (
                      <div className="mt-4 h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-emerald-500"
                          initial={false}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          style={{
                            width: `${(selectedDecision.actionPlan.items.filter((i) => i.done).length / selectedDecision.actionPlan.items.length) * 100}%`,
                          }}
                        />
                      </div>
                    )}

                    <div className="mt-5 space-y-1">
                      {selectedDecision.actionPlan && selectedDecision.actionPlan.items.length > 0 ? (
                        selectedDecision.actionPlan.items.map((item) => (
                          <motion.div
                            key={item.id}
                            layout
                            className="flex items-center gap-3 rounded-xl py-2 px-3 transition-colors hover:bg-zinc-800/50"
                          >
                            <motion.button
                              type="button"
                              onClick={() => {
                                updateActionPlan(selectedDecision.id, (plan) => ({
                                  ...plan,
                                  items: plan.items.map((i) =>
                                    i.id === item.id ? { ...i, done: !i.done } : i
                                  ),
                                }));
                              }}
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                                item.done ? "border-emerald-500 bg-emerald-500" : "border-zinc-600 bg-transparent"
                              }`}
                              style={{ minWidth: 20, minHeight: 20 }}
                              aria-checked={item.done}
                              role="checkbox"
                              whileTap={{ scale: 1.05 }}
                              transition={{ duration: 0.15 }}
                            >
                              {item.done ? (
                                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : null}
                            </motion.button>
                            <input
                              type="text"
                              value={item.text}
                              onChange={(e) => {
                                updateActionPlan(selectedDecision.id, (plan) => ({
                                  ...plan,
                                  items: plan.items.map((i) =>
                                    i.id === item.id ? { ...i, text: e.target.value } : i
                                  ),
                                }));
                              }}
                              className={`min-w-0 flex-1 bg-transparent text-sm outline-none transition-opacity ${
                                item.done
                                  ? "text-zinc-500 opacity-70 line-through"
                                  : "text-zinc-100 focus:underline focus:underline-offset-2 decoration-zinc-500"
                              }`}
                            />
                          </motion.div>
                        ))
                      ) : (
                        <p className="py-4 text-center text-sm text-zinc-500">
                          Define tu primer paso.
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !selectedDecision.actionPlan ||
                            selectedDecision.actionPlan.items.length >= 5
                          )
                            return;
                          updateActionPlan(selectedDecision.id, (plan) => ({
                            ...plan,
                            items: [
                              ...plan.items,
                              { id: genId(), text: "", done: false },
                            ],
                          }));
                        }}
                        disabled={
                          !selectedDecision.actionPlan ||
                          selectedDecision.actionPlan.items.length >= 5
                        }
                        className="text-xs text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        + Agregar paso
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const template = getDefaultActionPlanTemplate(
                            selectedDecision.recommendation
                          );
                          updateActionPlan(selectedDecision.id, () => template);
                        }}
                        className="text-xs text-zinc-500 transition-colors hover:text-zinc-400"
                      >
                        Restaurar plantilla
                      </button>
                    </div>

                    {selectedDecision.actionPlan?.items.length &&
                      selectedDecision.actionPlan.items.every((i) => i.done) && (
                        <p className="mt-4 pt-4 border-t border-zinc-800 text-center text-sm text-emerald-400/90">
                          Plan ejecutado.
                        </p>
                      )}
                  </div>
                </div>
              )}
            </motion.main>
          )}

          {screen === 6 && (
            <motion.main
              key="screen6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={transition}
              className="w-full rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8"
            >
              <h1 className="text-xl font-medium tracking-tight text-zinc-100">Plan Pro</h1>
              <p className="mt-2 text-sm text-zinc-500">Desbloquea todo el potencial de Decision Fitness.</p>
              <ul className="mt-6 space-y-4 text-sm text-zinc-300">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>Guardado ilimitado de decisiones</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>IA (próximamente)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>Seguimiento y métricas avanzadas</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>Exportar (próximamente)</span>
                </li>
              </ul>
              <div className="mt-8 flex flex-col gap-3">
                <button
                  type="button"
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-800 py-3 text-sm font-medium text-zinc-200"
                >
                  Próximamente pagos
                </button>
                <button
                  type="button"
                  onClick={() => setScreen(1)}
                  className="w-full rounded-xl border border-zinc-800 py-3 text-sm font-medium text-zinc-500 hover:text-zinc-300"
                >
                  Volver
                </button>
              </div>
            </motion.main>
          )}
        </AnimatePresence>
      </div>

      {aiHelperPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setAiHelperPrompt(null)}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl sm:rounded-2xl"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">
              Prompt para IA (opcional)
            </p>
            <textarea
              readOnly
              value={aiHelperPrompt}
              className="min-h-[120px] w-full resize-none rounded-xl border border-zinc-800 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-200 focus:outline-none"
              rows={5}
            />
            <p className="mt-2 text-xs text-zinc-500">
              Copia y pega en tu asistente favorito para obtener la respuesta.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText(aiHelperPrompt);
                    setAiHelperCopied(true);
                    setTimeout(() => setAiHelperCopied(false), 2000);
                  }
                }}
                className="flex-1 rounded-xl border border-zinc-600 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
              >
                {aiHelperCopied ? "Copiado" : "Copiar prompt"}
              </button>
              <button
                type="button"
                onClick={() => setAiHelperPrompt(null)}
                className="rounded-xl border border-zinc-700 py-2.5 px-4 text-sm text-zinc-400 hover:text-zinc-300"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <HomeContent />
    </Suspense>
  );
}
