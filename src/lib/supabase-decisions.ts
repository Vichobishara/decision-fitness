import type { Reversibility } from "@/lib/decisionEngine";
import { supabase, type DbDecision, type DbFollowUp, type DbActionPlan, type Profile } from "./supabaseClient";

export type SavedDecisionFromDb = {
  id: string;
  createdAt: string;
  decisionText: string;
  input: { reversibility: Reversibility; conviction: number; costIfWrong: number; energy: number };
  score: number;
  recommendation: string;
  reason: string;
  followUp?: { actionTaken: "actue" | "espere" | "descarte"; regret: boolean; outcome: "mejor" | "igual" | "peor"; updatedAt: string };
  actionPlan?: { items: { id: string; text: string; done: boolean }[]; createdAt: string; updatedAt: string };
  decisionType?: string;
};

function costToNumber(cost: string | null): number {
  if (cost === "bajo") return 3;
  if (cost === "alto") return 9;
  return 6;
}
function emotionalToEnergy(state: string | null): number {
  if (state === "calmado") return 0;
  if (state === "ansioso") return -4;
  return -3;
}

export function mapDbToSavedDecision(
  d: DbDecision,
  followUps: DbFollowUp[],
  actionPlans: DbActionPlan[]
): SavedDecisionFromDb {
  const latestFollowUp = followUps
    .filter((f) => f.decision_id === d.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const plan = actionPlans.find((p) => p.decision_id === d.id);
  const reversibility = (d.reversibility as Reversibility) ?? "semi";
  const costIfWrong = costToNumber(d.cost_level);
  const energy = emotionalToEnergy(d.emotional_state);
  return {
    id: d.id,
    createdAt: d.created_at,
    decisionText: d.decision_text,
    input: { reversibility, conviction: 6, costIfWrong, energy },
    score: d.score,
    recommendation: d.recommendation,
    reason: d.reason_text,
    ...(latestFollowUp && {
      followUp: {
        actionTaken: latestFollowUp.action_taken as "actue" | "espere" | "descarte",
        regret: latestFollowUp.regret,
        outcome: latestFollowUp.outcome as "mejor" | "igual" | "peor",
        updatedAt: latestFollowUp.created_at,
      },
    }),
    ...(plan && {
      actionPlan: {
        items: Array.isArray(plan.items) ? plan.items : [],
        createdAt: plan.created_at,
        updatedAt: plan.updated_at,
      },
    }),
    ...(d.decision_type && { decisionType: d.decision_type }),
  };
}

export async function upsertUser(userId: string, email: string | null): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("users")
    .upsert(
      { id: userId, email: email ?? null, role: "free", updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  return { error: error ? new Error(error.message) : null };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const fields = "id, email, role, pro_since, stripe_customer, created_at, updated_at";
  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select(fields)
    .eq("id", userId)
    .maybeSingle();
  if (!usersError && usersData) {
    return {
      id: usersData.id,
      email: usersData.email ?? null,
      role: (usersData.role as "free" | "pro") ?? "free",
      pro_since: (usersData as { pro_since?: string | null }).pro_since ?? null,
      stripe_customer: usersData.stripe_customer ?? null,
      created_at: usersData.created_at,
      updated_at: usersData.updated_at,
    };
  }
  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profilesError && profilesData) {
    return {
      id: profilesData.id,
      email: profilesData.email ?? null,
      role: (profilesData.role as "free" | "pro") ?? "free",
    };
  }
  return null;
}

export async function getDecisionCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("decisions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return 0;
  return count ?? 0;
}

export async function getDecisions(userId: string): Promise<{
  decisions: DbDecision[];
  followUps: DbFollowUp[];
  actionPlans: DbActionPlan[];
}> {
  const [decRes, followRes, planRes] = await Promise.all([
    supabase.from("decisions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("follow_ups").select("*"),
    supabase.from("action_plans").select("*"),
  ]);
  const decisions = (decRes.data ?? []) as DbDecision[];
  const decisionIds = new Set(decisions.map((d) => d.id));
  const followUps = ((followRes.data ?? []) as DbFollowUp[]).filter((f) => decisionIds.has(f.decision_id));
  const actionPlans = ((planRes.data ?? []) as DbActionPlan[]).filter((p) => decisionIds.has(p.decision_id));
  return { decisions, followUps, actionPlans };
}

type InsertDecisionPayload = {
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
};

export async function insertDecision(payload: InsertDecisionPayload): Promise<{ data: DbDecision | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("decisions")
    .insert({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as DbDecision, error: null };
}

export async function insertFollowUp(decisionId: string, payload: { action_taken: string; regret: boolean; outcome: string }): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("follow_ups").insert({
    decision_id: decisionId,
    action_taken: payload.action_taken,
    regret: payload.regret,
    outcome: payload.outcome,
  });
  return { error: error ? new Error(error.message) : null };
}

export async function upsertActionPlan(decisionId: string, items: { id: string; text: string; done: boolean }[]): Promise<{ error: Error | null }> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("action_plans").upsert(
    {
      decision_id: decisionId,
      items,
      updated_at: now,
    },
    { onConflict: "decision_id" }
  );
  return { error: error ? new Error(error.message) : null };
}

export async function updateDecisionUpdatedAt(decisionId: string): Promise<void> {
  await supabase
    .from("decisions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", decisionId);
}
