"use client";

import { useState } from "react";
import { supabase } from "@/services/supabase";

type AddExerciseFormProps = {
  onExerciseAdded: () => Promise<void>;
};

export default function AddExerciseForm({
  onExerciseAdded,
}: AddExerciseFormProps) {
  const [exerciseName, setExerciseName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [lifetimeGoalMinutes, setLifetimeGoalMinutes] = useState(1000);
  const [targetBpm, setTargetBpm] = useState<number | "">(60);

  async function addExercise() {
   if (!exerciseName.trim() || targetBpm === "") return;

    setSaving(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You are not signed in.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("exercises").insert({
      user_id: user.id,
      name: exerciseName,
      target_bpm: targetBpm,
      target_minutes: 0,
      lifetime_goal_minutes: lifetimeGoalMinutes,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setExerciseName("");
      setMessage("Exercise saved.");
      await onExerciseAdded();
    }

    setSaving(false);
  }

return (
  <div>
   <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1 block text-sm text-gray-600">
          Exercise name
        </label>

        <input
          type="text"
          placeholder="Exercise name"
          value={exerciseName}
          onChange={(e) => setExerciseName(e.target.value)}
          className="w-full rounded border p-3"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-600">
          Target BPM
        </label>

        <input
          type="text"
inputMode="numeric"
          min="1"
          value={targetBpm}
          onChange={(e) =>
          setTargetBpm(e.target.value === "" ? "" : Number(e.target.value))
          }
          className="w-full rounded border p-3 sm:w-32"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-600">
          Target time
        </label>

        <select
          value={lifetimeGoalMinutes}
          onChange={(e) =>
            setLifetimeGoalMinutes(Number(e.target.value))
          }
          className="w-full rounded border p-3 sm:w-40"
        >
          <option value={100}>100 minutes</option>
          <option value={500}>500 minutes</option>
          <option value={1000}>1000 minutes</option>
        </select>
      </div>

      <button
        onClick={addExercise}
        disabled={saving}
       className="w-full rounded bg-blue-600 px-6 py-3 text-white disabled:opacity-50 sm:w-auto"
      >
        {saving ? "Saving..." : "Add Exercise"}
      </button>
    </div>

    {message && (
      <p className="mt-4 text-sm text-gray-600">
        {message}
      </p>
    )}
  </div>
);
}