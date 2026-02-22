/**
 * Demo leads: insert from Modo demo when user submits email gate.
 * Table: public.leads (see supabase/migrations/003_leads.sql)
 *
 * create table public.leads (
 *   id uuid default gen_random_uuid() primary key,
 *   email text not null,
 *   decision_text text,
 *   score int,
 *   recommendation text,
 *   reason_text text,
 *   created_at timestamptz default now()
 * );
 */

import { supabase } from "@/lib/supabase";

export type LeadInsert = {
  email: string;
  decision_text?: string | null;
  score?: number | null;
  recommendation?: string | null;
  reason_text?: string | null;
};

export async function insertLead(data: LeadInsert): Promise<{ error: Error | null }> {
  const { error: err } = await supabase.from("leads").insert({
    email: data.email.trim(),
    decision_text: data.decision_text ?? null,
    score: data.score ?? null,
    recommendation: data.recommendation ?? null,
    reason_text: data.reason_text ?? null,
  });
  return { error: err ? new Error(err.message) : null };
}
