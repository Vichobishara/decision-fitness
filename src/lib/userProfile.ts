import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/lib/supabaseClient";

const FREE_ROLE = "free";

/**
 * Ensures the current user has a row in public.users.
 * On first login: inserts { id, email, role: "free", pro_since: null }.
 * If row already exists: updates only email and updated_at (keeps existing role and pro_since).
 * Returns the profile or null if no session.
 */
export async function ensureUserProfile(): Promise<Profile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const userId = session.user.id;
  const email = session.user.email ?? null;

  const { data: existing } = await supabase
    .from("users")
    .select("id, role, pro_since")
    .eq("id", userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("users")
      .update({ email, updated_at: new Date().toISOString() })
      .eq("id", userId);
  } else {
    await supabase.from("users").insert({
      id: userId,
      email,
      role: FREE_ROLE,
      updated_at: new Date().toISOString(),
    });
  }

  const { data: row } = await supabase
    .from("users")
    .select("id, email, role, created_at, updated_at")
    .eq("id", userId)
    .single();

  if (!row) return null;
  const withProSince = row as { pro_since?: string | null };
  return {
    id: row.id,
    email: row.email ?? null,
    role: (row.role as "free" | "pro") ?? FREE_ROLE,
    pro_since: withProSince.pro_since ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
