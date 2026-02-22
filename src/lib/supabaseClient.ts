import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client using NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY only.
 * No secrets hardcoded. If URL is a project ref (no "http"), builds https://<ref>.supabase.co
 */
function getSupabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}.supabase.co`;
}

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = "free" | "pro";

export type DbUser = {
  id: string;
  email: string | null;
  role: UserRole;
  stripe_customer: string | null;
  pro_since: string | null;
  created_at: string;
  updated_at: string;
};

export type DbDecision = {
  id: string;
  user_id: string;
  decision_text: string;
  objective: string | null;
  alternatives: string[] | null;
  evidence_for: string | null;
  evidence_missing: string | null;
  cost_level: string | null;
  reversibility: string | null;
  emotional_state: string | null;
  score: number;
  recommendation: string;
  reason_text: string;
  decision_type: string | null;
  created_at: string;
  updated_at: string;
};

export type DbFollowUp = {
  id: string;
  decision_id: string;
  action_taken: string;
  regret: boolean;
  outcome: string;
  created_at: string;
  updated_at: string;
};

export type DbActionPlan = {
  id: string;
  decision_id: string;
  items: { id: string; text: string; done: boolean }[];
  created_at: string;
  updated_at: string;
};

export type DbSubscription = {
  id: string;
  user_id: string;
  stripe_subscription: string | null;
  status: string;
  plan: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

export type DbPayment = {
  id: string;
  subscription_id: string;
  stripe_invoice_id: string | null;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
};

/** Profile shape used by app (from users table) */
export type Profile = {
  id: string;
  email: string | null;
  role: UserRole;
  pro_since?: string | null;
  stripe_customer?: string | null;
  created_at?: string;
  updated_at?: string;
};
