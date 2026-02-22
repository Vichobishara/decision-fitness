"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, type Profile } from "@/lib/supabaseClient";
import { getProfile } from "@/lib/supabase-decisions";
import { ensureUserProfile } from "@/lib/userProfile";

type SessionUser = { id: string; email?: string };

type AuthState = {
  session: { user: SessionUser } | null;
  user: SessionUser | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
};

type AuthContextValue = AuthState & {
  signOut: () => Promise<void>;
  setError: (msg: string | null) => void;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{ user: SessionUser } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async (userId: string) => {
    const p = await getProfile(userId);
    setProfile(p ?? null);
  }, []);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!url || !key) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    supabase.auth.getSession()
      .then(async ({ data: { session: s } }) => {
        if (cancelled) return;
        setSession(s as { user: SessionUser } | null);
        if (s?.user) {
          const p = await ensureUserProfile();
          setProfile(p ?? null);
          if (!p) refreshProfile(s.user.id);
        } else {
          setProfile(null);
        }
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (cancelled) return;
      setSession(s as { user: SessionUser } | null);
      if (s?.user) {
        const p = await ensureUserProfile();
        setProfile(p ?? null);
        if (!p) refreshProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    setError(null);
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    error,
    setError,
    signOut,
    refreshProfile: () => (session?.user?.id ? refreshProfile(session.user.id) : Promise.resolve()),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAuthOptional() {
  return useContext(AuthContext);
}
