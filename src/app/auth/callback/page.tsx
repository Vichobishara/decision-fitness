"use client";

import { supabase } from "@/lib/supabaseClient";
import { ensureUserProfile } from "@/lib/userProfile";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"exchanging" | "done" | "error">("exchanging");

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setStatus("error");
      router.replace("/?error=no_code");
      return;
    }

    let cancelled = false;
    supabase.auth
      .exchangeCodeForSession(code)
      .then(async () => {
        if (cancelled) return;
        await ensureUserProfile();
        setStatus("done");
        router.replace("/");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          router.replace("/?error=exchange_failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0F0F12] px-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-8 py-6 text-center">
        {status === "exchanging" && (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
            <p className="mt-4 text-sm text-zinc-400">Completando inicio de sesión…</p>
          </>
        )}
        {status === "done" && <p className="text-sm text-zinc-400">Redirigiendo…</p>}
        {status === "error" && <p className="text-sm text-red-400">Error. Redirigiendo.</p>}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <CallbackContent />
    </Suspense>
  );
}
