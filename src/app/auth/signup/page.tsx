"use client";

import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Introduce tu email.");
      return;
    }
    if (!password) {
      setError("Elige una contraseña.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      showToast("success", "Cuenta creada. Revisa tu email para confirmar.");
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrarse.";
      setError(msg);
      showToast("error", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({ provider });
      if (err) throw err;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al conectar.";
      setError(msg);
      showToast("error", msg);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0F0F12] px-6 py-12">
      <div className="mx-auto w-full max-w-sm space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <h1 className="text-center text-xl font-medium tracking-tight text-zinc-100">
          Crear cuenta
        </h1>
        <p className="text-center text-sm text-zinc-500">
          Regístrate para guardar tus decisiones y acceder desde cualquier dispositivo.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="Email"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            autoComplete="email"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="Contraseña (mín. 6 caracteres)"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-800/50 px-4 py-3 pr-10 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? "Ocultar" : "Ver"}
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "Creando cuenta…" : "Registrarse"}
          </button>
        </form>

        <div className="relative">
          <span className="block text-center text-xs text-zinc-500">o continúa con</span>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-800/50 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700/50"
          >
            Continuar con Google
          </button>
          <button
            type="button"
            onClick={() => handleOAuth("apple")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-800/50 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700/50"
          >
            Continuar con Apple
          </button>
        </div>

        <p className="text-center text-sm text-zinc-500">
          ¿Ya tienes cuenta?{" "}
          <Link href="/auth/login" className="font-medium text-zinc-300 hover:text-zinc-100">
            Iniciar sesión
          </Link>
        </p>
      </div>

      {toast && (
        <div
          className={`fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-lg ${
            toast.type === "success"
              ? "border-emerald-800/80 bg-zinc-900/95 text-emerald-200"
              : "border-red-900/80 bg-zinc-900/95 text-red-200"
          }`}
          role="alert"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
