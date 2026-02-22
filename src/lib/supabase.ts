/**
 * Re-export Supabase client and types from supabaseClient (single source, env-based).
 * Do NOT hardcode any secret; all keys come from environment variables.
 */
export {
  supabase,
  type UserRole,
  type DbUser,
  type DbDecision,
  type DbFollowUp,
  type DbActionPlan,
  type DbSubscription,
  type DbPayment,
  type Profile,
} from "./supabaseClient";
