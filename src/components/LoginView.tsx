"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

type LoginViewProps = {
  onGoogle: () => void;
  onEmailSubmit?: (email: string, password: string) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  loadingOAuth?: boolean;
};

const SOCIAL_PROOF_LINE = "Más de 2.400 decisiones estructuradas tomadas esta semana.";

export function LoginView({
  onGoogle,
  onEmailSubmit,
  loading = false,
  error = null,
  loadingOAuth = false,
}: LoginViewProps) {
  const [showMore, setShowMore] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onEmailSubmit) return;
    setSubmitting(true);
    try {
      await onEmailSubmit(email.trim(), password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0c0c0e] px-6 py-16">
      {/* Hero-style radial glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background: "radial-gradient(ellipse 85% 55% at 50% 0%, rgba(63,63,70,0.35), transparent 55%)",
        }}
      />
      {/* Very light grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
      >
        <h1 className="text-lg font-medium tracking-tight text-zinc-400">Decision Fitness</h1>
        <p className="mt-1 text-xs text-zinc-600">Claridad para decidir</p>

        <h2 className="mt-16 text-2xl font-medium tracking-tight text-zinc-100">
          Inicia sesión
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Toma mejores decisiones con claridad, sin sobrepensar.
        </p>
        <p className="mt-2 text-xs text-zinc-600">
          Tus decisiones quedan guardadas en tu cuenta.
        </p>
        <p className="mt-4 text-xs text-zinc-500">
          {SOCIAL_PROOF_LINE}
        </p>

        <div className="mt-12 w-full space-y-4">
          <motion.button
            type="button"
            onClick={onGoogle}
            disabled={loadingOAuth}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-zinc-600 bg-zinc-100 py-4.5 text-sm font-medium text-zinc-900 shadow-lg transition hover:bg-white hover:border-zinc-500 disabled:opacity-60"
            whileTap={{ scale: 0.98 }}
          >
            {loadingOAuth ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-300" />
            ) : (
              "Continuar con Google"
            )}
          </motion.button>

          <button
            type="button"
            onClick={() => setShowMore((m) => !m)}
            className="text-xs text-zinc-500 hover:text-zinc-400 transition"
          >
            {showMore ? "Ocultar opciones" : "Más opciones"}
          </button>

          <AnimatePresence>
            {showMore && onEmailSubmit && (
              <motion.form
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleEmailSubmit}
                className="overflow-hidden space-y-3"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  autoComplete="email"
                />
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 pr-12 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-400"
                  >
                    {showPassword ? "Ocultar" : "Ver"}
                  </button>
                </div>
                {(error || loading) && (
                  <p className={`text-sm ${error ? "text-amber-400/90" : "text-zinc-500"}`}>
                    {error || "Comprobando…"}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting || loading}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {submitting ? "Entrando…" : "Iniciar sesión con email"}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {error && !showMore && (
          <p className="mt-6 rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-200/90">
            {error}
          </p>
        )}
      </motion.div>
    </div>
  );
}
