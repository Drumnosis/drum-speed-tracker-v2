import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingSession } from "@/utils/practiceState";

type PracticeDatabase = Pick<SupabaseClient, "from">;

export async function savePracticeBpm(database: PracticeDatabase, userId: string, exerciseId: string, bpm: number) {
  const { data, error } = await database.from("exercises")
    .update({ last_practice_bpm: bpm })
    .eq("id", exerciseId).eq("user_id", userId)
    .select("id, last_practice_bpm");
  if (error) throw new Error(`Saving exercise Practice BPM: ${error.message} (${error.code})`);
  if (data?.length === 1 && data[0].last_practice_bpm === bpm) return;
  // RLS can filter an UPDATE to zero rows without reporting a database error.
  // Read back before accepting success; dropping single() alone would hide
  // the failed write and lose the remembered tempo again.
  const { data: visible, error: readError } = await database.from("exercises")
    .select("id, last_practice_bpm").eq("id", exerciseId).eq("user_id", userId);
  if (readError) throw new Error(`Verifying exercise Practice BPM: ${readError.message} (${readError.code})`);
  if (visible?.length === 1 && visible[0].last_practice_bpm === bpm) return;
  if (visible?.length === 1) {
    throw new Error("The exercise is readable, but its Practice BPM was not updated. Check the exercises UPDATE row-level security policy in Supabase. The save remains queued.");
  }
  throw new Error("The exercise is no longer available to this signed-in account. The save remains queued.");
}

export async function saveCompletedPractice(database: PracticeDatabase, userId: string, session: PendingSession) {
  const { error } = await database.from("drum_sessions").upsert(
    { ...session, user_id: userId },
    { onConflict: "user_id,client_session_id", ignoreDuplicates: true });
  if (error) throw new Error(`Saving completed practice session: ${error.message} (${error.code})`);
  // Keep the completion queued until BOTH writes succeed. A retry uses the
  // same session ID, and a refresh can only see completion after its BPM saved.
  await savePracticeBpm(database, userId, session.exercise_id, session.bpm);
}
