"use client";

import { supabase } from "@/lib/supabase";
import { useEffect } from "react";

/**
 * Development-only: verify Supabase connection on app load.
 * Logs env vars and runs a test query against public.users.
 * Remove or disable in production.
 */
export function SupabaseConnectionTest() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    console.log("NEXT_PUBLIC_SUPABASE_URL:", url ?? "(missing)");
    console.log("NEXT_PUBLIC_SUPABASE_ANON_KEY exists:", hasAnonKey);

    supabase
      .from("users")
      .select("*")
      .limit(1)
      .then(({ error }) => {
        if (error) {
          console.log("SUPABASE ERROR:", error.message);
        } else {
          console.log("SUPABASE OK");
        }
      });
  }, []);

  return null;
}
