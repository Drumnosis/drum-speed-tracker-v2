import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

const exerciseColumns = "id, name, archived, target_bpm, starting_bpm, last_practice_bpm, lifetime_goal_minutes, groove_scribe_url";
const progressionColumns = "auto_progress_enabled, auto_progress_after, auto_progress_by, auto_progress_count";

export function formatSupabaseError(error: Pick<PostgrestError, "message" | "code" | "details">, status: number) {
  const code = error.code || (status ? `HTTP ${status}` : "no HTTP response");
  const message = error.message || error.details || "Supabase returned no error message.";
  return `[${code}] ${message}`;
}

export async function loadExercises(database: Pick<SupabaseClient, "from">, userId: string) {
  function query<Columns extends string>(columns: Columns) {
    return database.from("exercises").select(columns).eq("user_id", userId)
      .order("created_at", { ascending: true });
  }

  const result = await query(`${exerciseColumns}, ${progressionColumns}`);
  if (result.error?.code === "42703" && /\bexercises\.auto_progress_(?:enabled|after|by|count)\b/.test(result.error.message)) {
    return { ...await query(exerciseColumns), progressionError: formatSupabaseError(result.error, result.status) };
  }

  return { ...result, progressionError: null };
}
