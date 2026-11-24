import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingSession } from "@/utils/practiceState";
import type { Exercise } from "@/types";

type PracticeDatabase = Pick<SupabaseClient, "from">;

export async function savePracticeBpm(database: PracticeDatabase, userId: string, exerciseId: string, bpm: number, resetProgress = false) {
  const { data, error } = await database.from("exercises")
    .update({ last_practice_bpm: bpm, ...(resetProgress ? { auto_progress_count: 0 } : {}) })
    .eq("id", exerciseId).eq("user_id", userId)
    .select("id, last_practice_bpm, auto_progress_count");
  if (error) throw new Error(`Saving exercise Practice BPM: ${error.message} (${error.code})`);
  if (data?.length === 1 && data[0].last_practice_bpm === bpm && (!resetProgress || data[0].auto_progress_count === 0)) return;
  // RLS can filter an UPDATE to zero rows without reporting a database error.
  // Read back before accepting success; dropping single() alone would hide
  // the failed write and lose the remembered tempo again.
  const { data: visible, error: readError } = await database.from("exercises")
    .select("id, last_practice_bpm, auto_progress_count").eq("id", exerciseId).eq("user_id", userId);
  if (readError) throw new Error(`Verifying exercise Practice BPM: ${readError.message} (${readError.code})`);
  if (visible?.length === 1 && visible[0].last_practice_bpm === bpm && (!resetProgress || visible[0].auto_progress_count === 0)) return;
  if (visible?.length === 1) {
    throw new Error("The exercise is readable, but its Practice BPM was not updated. Check the exercises UPDATE row-level security policy in Supabase. The save remains queued.");
  }
  throw new Error("The exercise is no longer available to this signed-in account. The save remains queued.");
}

export async function saveCompletedPractice(database: PracticeDatabase, userId: string, session: PendingSession) {
  if (!Number.isSafeInteger(session.minutes) || session.minutes <= 0) {
    throw new Error("Practice duration must be a positive whole number of minutes. Fractional minutes cannot be saved.");
  }
  const { error } = await database.from("drum_sessions").upsert(
    { ...session, user_id: userId, practice_completed: true },
    { onConflict: "user_id,client_session_id", ignoreDuplicates: true });
  if (error) throw new Error(`Saving completed practice session: ${error.message} (${error.code})`);
  // The database commits session + remembered BPM + progression atomically.
  // Never write session.bpm afterwards: it could undo the earned increase.
  const { data, error: readError } = await database.from("exercises").select("*")
    .eq("id", session.exercise_id).eq("user_id", userId);
  if (readError || data?.length !== 1) throw new Error(`Verifying completed practice: ${readError?.message ?? "Exercise unavailable"}`);
  return data[0] as Exercise;
}
