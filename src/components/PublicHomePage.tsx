"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

const PREFILL_KEY = "decision_fitness_prefill";

const CASOS_TIPICOS = [
  { label: "¿Renuncio o espero?", prefill: "¿Renuncio o espero?" },
  { label: "¿Compro esto o es impulso?", prefill: "¿Compro esto o es impulso?" },
  { label: "¿Cambio de proyecto o no?", prefill: "¿Cambio de proyecto o no?" },
] as const;

function handleCasoClick(prefill: string, router: ReturnType<typeof useRouter>) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(PREFILL_KEY, prefill);
  }
  router.push("/?demo=1");
}

export function PublicHomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <main className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-14">
        {/* Hero + Product Preview row */}
        <section className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <div className="flex-1 text-center lg:text-left">
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl"
            >
              Decide con claridad.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
              className="mt-4 text-lg leading-relaxed text-zinc-300 sm:text-xl"
            >
              Reduce la duda. Evita el arrepentimiento. Decide con un método.
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.14, ease: "easeOut" }}
              className="mt-2 text-sm text-zinc-500"
            >
              Diseñado para personas que sobrepiensan.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap lg:justify-start"
            >
              <Link
                href="/?demo=1"
                className="w-full rounded-2xl border border-zinc-600 bg-zinc-100 py-4 px-8 text-center text-sm font-medium text-zinc-900 transition hover:bg-white sm:w-auto"
              >
                Probar sin cuenta
              </Link>
              <Link
                href="/auth/login"
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-800/60 py-4 px-8 text-center text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 sm:w-auto"
              >
                Analizar mi primera decisión
              </Link>
              <a
                href="#ejemplo"
                className="w-full rounded-2xl border border-zinc-700/80 bg-zinc-800/50 py-4 px-8 text-center text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 sm:w-auto"
              >
                Ver ejemplo (30s)
              </a>
            </motion.div>
          </div>

          {/* Product Preview card (Apple-like) */}
          <motion.div
            id="ejemplo"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25, ease: "easeOut" }}
            className="scroll-mt-24 shrink-0 lg:w-[320px]"
          >
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/25">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Resultado
              </p>
              <p className="mt-2 line-clamp-2 text-sm text-zinc-200">
                ¿Acepto la oferta en otra empresa o me quedo?
              </p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-light tabular-nums text-zinc-100">72</span>
                <span className="text-xs text-zinc-500">Claridad</span>
              </div>
              <p className="mt-3 rounded-lg bg-zinc-800/60 px-3 py-2 text-xs font-medium text-zinc-300">
                Actuar — tienes suficiente claridad.
              </p>
              <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Próximos pasos
              </p>
              <ul className="mt-1.5 space-y-1.5 text-xs text-zinc-400">
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-zinc-500" />
                  Define la fecha límite para responder.
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-zinc-500" />
                  Escribe qué necesitas aclarar con tu jefe actual.
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-zinc-500" />
                  Compara oferta en papel (sueldo, crecimiento, riesgo).
                </li>
              </ul>
            </div>
          </motion.div>
        </section>

        {/* Casos típicos — one-click demo */}
        <section className="mt-16">
          <p className="text-center text-sm font-medium text-zinc-500">
            Casos típicos
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {CASOS_TIPICOS.map((c) => (
              <motion.button
                key={c.prefill}
                type="button"
                onClick={() => handleCasoClick(c.prefill, router)}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-left text-sm font-medium text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-800/80"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
              >
                {c.label}
              </motion.button>
            ))}
          </div>
        </section>

        {/* Cómo funciona - ultra short */}
        <section id="como-funciona" className="mt-24 scroll-mt-20">
          <h2 className="text-center text-sm font-medium uppercase tracking-wider text-zinc-500">
            Cómo funciona
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              { title: "Escribe", line: "La decisión en una frase." },
              { title: "Evalúa", line: "Convicción, costo y reversibilidad." },
              { title: "Actúa", line: "Recomendación y próximos pasos." },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 * i }}
                whileHover={{ y: -4 }}
                className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-5 transition-shadow hover:shadow-lg hover:shadow-black/10"
              >
                <h3 className="font-medium text-zinc-200">{item.title}</h3>
                <p className="mt-1 text-sm text-zinc-400">{item.line}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Why different - slightly higher contrast */}
        <section className="mt-20">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 px-6 py-8 text-center sm:px-10"
          >
            <p className="text-lg leading-relaxed text-zinc-300 sm:text-xl">
              No es motivación. Es estructura. Tomar decisiones es una habilidad entrenable.
            </p>
          </motion.div>
        </section>

        {/* Feature preview - hover lift */}
        <section className="mt-20">
          <h2 className="text-center text-sm font-medium uppercase tracking-wider text-zinc-500">
            Qué obtienes
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              { title: "Claridad", desc: "Puntaje y diagnóstico a partir de convicción, costo y reversibilidad." },
              { title: "Confianza", desc: "Acción recomendada y próximos pasos concretos." },
              { title: "Seguimiento a 7 días", desc: "Check-in y notas para decisiones que conviene esperar." },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.4, delay: 0.05 * i }}
                whileHover={{ y: -4 }}
                className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-5 transition-shadow hover:shadow-lg hover:shadow-black/10"
              >
                <h3 className="font-medium text-zinc-200">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mt-20 text-center">
          <p className="text-xl font-medium text-zinc-100 sm:text-2xl">
            Empieza a decidir mejor hoy.
          </p>
          <Link
            href="/auth/signup"
            className="mt-6 inline-block rounded-2xl border border-zinc-600 bg-zinc-100 py-4 px-10 text-sm font-medium text-zinc-900 transition hover:bg-white"
          >
            Crear cuenta
          </Link>
        </section>

        {/* Footer */}
        <footer className="mt-24 border-t border-zinc-800/80 pt-8 text-center">
          <p className="text-sm text-zinc-500">
            Privacidad: tus decisiones son tuyas.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Hecho en Chile 🇨🇱
          </p>
        </footer>
      </main>
    </div>
  );
}
