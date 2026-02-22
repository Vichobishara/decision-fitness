"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";

export type CoachDecisionContext = {
  decisionText?: string;
  recommendation?: string;
  score?: number;
};

type CoachModalProps = {
  open: boolean;
  onClose: () => void;
  isPro: boolean;
  decisionContext?: CoachDecisionContext | null;
  onVerPlanPro?: () => void;
};

const REMINDERS = [
  "Pequeños pasos > perfección.",
  "Claridad viene con el tiempo.",
  "Una decisión a la vez.",
];

const CLARIFYING_QUESTIONS = [
  "¿Qué es lo que más te cuesta de esta decisión?",
  "¿Qué pasaría si esperas una semana más?",
  "¿Qué dato te haría sentir más seguro?",
  "¿Qué opción te quita más energía al pensarla?",
];

const SUGGESTIONS_POOL = [
  "Anota en una frase qué es lo que realmente quieres lograr.",
  "Revisa qué evidencia tienes a favor y en contra.",
  "Pregunta a alguien de confianza qué haría en tu lugar.",
  "Define un plazo corto (ej. 7 días) y revisa con calma.",
  "Separa el miedo al error del costo real de equivocarte.",
];

function pickTemplateResponse(ctx: CoachDecisionContext | null): {
  question: string;
  suggestions: string[];
  reminder: string;
} {
  const rec = ctx?.recommendation ?? "";
  const qIndex = (ctx?.decisionText?.length ?? 0) % CLARIFYING_QUESTIONS.length;
  const sStart = (ctx?.score ?? 0) % SUGGESTIONS_POOL.length;
  const suggestions = [
    SUGGESTIONS_POOL[sStart % SUGGESTIONS_POOL.length],
    SUGGESTIONS_POOL[(sStart + 1) % SUGGESTIONS_POOL.length],
  ];
  const reminder = REMINDERS[(ctx?.decisionText?.length ?? 0) % REMINDERS.length];
  return {
    question: CLARIFYING_QUESTIONS[qIndex],
    suggestions,
    reminder,
  };
}

type Message = { role: "user" | "assistant"; text: string };

export function CoachModal({
  open,
  onClose,
  isPro,
  decisionContext = null,
  onVerPlanPro,
}: CoachModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Estoy aquí para ayudarte a pensar más claro." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);
    setTimeout(() => {
      const { question, suggestions, reminder } = pickTemplateResponse(decisionContext);
      const reply = `${question}\n\n• ${suggestions.join("\n• ")}\n\n${reminder}`;
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      setSending(false);
    }, 600);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-zinc-800 bg-zinc-900 shadow-2xl sm:h-[520px] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-base font-medium text-zinc-100">Coach IA</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isPro ? (
          <>
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === "user"
                        ? "bg-zinc-700 text-zinc-100"
                        : "bg-zinc-800/80 text-zinc-300"
                    }`}
                  >
                    <p className="whitespace-pre-line">{m.text}</p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-zinc-800/80 px-4 py-2.5">
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "0ms" }} />
                    <span className="ml-1 inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "150ms" }} />
                    <span className="ml-1 inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-zinc-800 p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Escribe tu duda o reflexión…"
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="rounded-xl bg-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
                >
                  Enviar
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="relative flex-1 overflow-hidden">
            <div className="absolute inset-0 overflow-y-auto px-4 py-4 space-y-4 blur-md pointer-events-none select-none">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-zinc-800/80 text-zinc-400">
                    <p className="whitespace-pre-line">{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-6 shadow-xl backdrop-blur-sm">
                <h3 className="text-lg font-medium text-zinc-100">Desbloquea Coach IA</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Acceso al coach, mejores explicaciones y seguimiento.
                </p>
                <button
                  type="button"
                  onClick={onVerPlanPro}
                  className="mt-4 w-full rounded-xl border border-zinc-600 bg-zinc-800 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
                >
                  Ver Plan Pro
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
