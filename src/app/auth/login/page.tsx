"use client";

import { LoginView } from "@/components/LoginView";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";

function LoginContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingOAuth, setLoadingOAuth] = useState(false);

  const getRedirectTo = () =>
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "http://localhost:3000/auth/callback";

  return (
    <div className="flex min-h-screen flex-col">
      <LoginView
        onGoogle={() => {
          setError(null);
          setLoadingOAuth(true);
          supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: getRedirectTo() },
          });
        }}
        onEmailSubmit={async (email, password) => {
          setError(null);
          setLoading(true);
          try {
            const { error: err } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (err) throw err;
            router.push("/");
            router.refresh();
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error al iniciar sesión.");
          } finally {
            setLoading(false);
          }
        }}
        error={error}
        loading={loading}
        loadingOAuth={loadingOAuth}
      />
      <p className="fixed bottom-8 left-0 right-0 text-center text-sm text-zinc-500">
        ¿No tienes cuenta?{" "}
        <Link href="/auth/signup" className="font-medium text-zinc-300 hover:text-zinc-100">
          Regístrate
        </Link>
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <LoginContent />
    </Suspense>
  );
}
