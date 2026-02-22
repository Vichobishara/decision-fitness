"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

export type CheckInData = {
  whatChanged: string;
  clarityDirection: "subio" | "igual" | "bajo";
  newData: string;
  completedAt: string;
};

type CheckInCardProps = {
  createdAt: string;
  onSaveCheckIn: (data: CheckInData) => void;
  existingCheckIn?: CheckInData | null;
};

function daysSince(createdAt: string): number {
  const start = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.min(7, Math.max(0, Math.floor((now - start) / (24 * 60 * 60 * 1000))));
}

export function CheckInCard({
  createdAt,
  onSaveCheckIn,
  existingCheckIn = null,
}: CheckInCardProps) {
  const day = daysSince(createdAt);
  const [showForm, setShowForm] = useState(false);
  const [whatChanged, setWhatChanged] = useState(existingCheckIn?.whatChanged ?? "");
  const [clarityDirection, setClarityDirection] = useState<CheckInData["clarityDirection"]>(
    existingCheckIn?.clarityDirection ?? "igual"
  );
  const [newData, setNewData] = useState(existingCheckIn?.newData ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveCheckIn({
      whatChanged: whatChanged.trim(),
      clarityDirection,
      newData: newData.trim(),
      completedAt: new Date().toISOString(),
    });
    setShowForm(false);
  };

  if (existingCheckIn) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Check-in en 7 días
        </h3>
        <p className="mt-2 text-sm text-zinc-400">Completado</p>
        <p className="mt-1 text-xs text-zinc-500">
          Claridad: {existingCheckIn.clarityDirection === "subio" ? "Subió" : existingCheckIn.clarityDirection === "bajo" ? "Bajó" : "Igual"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Check-in en 7 días
      </h3>
      <div className="mt-3 flex items-center gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
          <div
            key={d}
            className={`h-1.5 flex-1 rounded-full ${
              d <= day ? "bg-emerald-500/70" : "bg-zinc-800"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Día {day}/7
      </p>

      <AnimatePresence>
        {!showForm ? (
          <motion.button
            key="btn"
            type="button"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowForm(true)}
            className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-800/60 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700/60"
          >
            Hacer check-in ahora
          </motion.button>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="mt-4 space-y-4"
          >
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                ¿Qué cambió desde la última vez?
              </label>
              <textarea
                value={whatChanged}
                onChange={(e) => setWhatChanged(e.target.value)}
                placeholder="Breve reflexión…"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
                rows={2}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                ¿Aumentó o bajó tu claridad?
              </label>
              <div className="flex gap-2">
                {(["subio", "igual", "bajo"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setClarityDirection(opt)}
                    className={`flex-1 rounded-xl border py-2 text-xs font-medium transition ${
                      clarityDirection === opt
                        ? "border-zinc-500 bg-zinc-700/50 text-zinc-100"
                        : "border-zinc-800 bg-zinc-800/40 text-zinc-500 hover:border-zinc-700"
                    }`}
                  >
                    {opt === "subio" ? "Subió" : opt === "bajo" ? "Bajó" : "Igual"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                ¿Qué dato nuevo apareció?
              </label>
              <input
                type="text"
                value={newData}
                onChange={(e) => setNewData(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm text-zinc-500 hover:text-zinc-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-zinc-700 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-600"
              >
                Guardar check-in
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
