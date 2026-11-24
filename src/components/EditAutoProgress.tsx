"use client";

import { useState } from "react";
import { supabase } from "@/services/supabase";
import type { Exercise } from "@/types";
import AutoProgressFields, { defaultProgressSettings } from "./AutoProgressFields";

export default function EditAutoProgress({ exercise, onSaved }: { exercise: Exercise; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState({
    auto_progress_enabled: exercise.auto_progress_enabled ?? defaultProgressSettings.auto_progress_enabled,
    auto_progress_after: exercise.auto_progress_after ?? defaultProgressSettings.auto_progress_after,
    auto_progress_by: exercise.auto_progress_by ?? defaultProgressSettings.auto_progress_by,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setSaving(true); setMessage("");
    try {
      const { data, error } = await supabase.from("exercises").update(value).eq("id", exercise.id).select("id");
      if (error || data?.length !== 1) throw new Error(error?.message ?? "Exercise update denied");
      await onSaved(); setMessage("Auto Progression saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save Auto Progression."); }
    finally { setSaving(false); }
  }
  return <div className="mt-4 space-y-3">
    <AutoProgressFields value={value} onChange={setValue} disabled={saving} />
    <button onClick={() => void save()} disabled={saving} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">{saving ? "Saving…" : "Save Auto Progression"}</button>
    {exercise.auto_progress_enabled && <p className="text-sm">{(exercise.last_practice_bpm ?? exercise.starting_bpm ?? 60) >= exercise.target_bpm
      ? "Auto Progress: Target reached" : `Auto Progress: ${exercise.auto_progress_count ?? 0} of ${exercise.auto_progress_after ?? 4} sessions → +${exercise.auto_progress_by ?? 2} BPM`}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
