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
  const [targetBpm, setTargetBpm] = useState(60);

  async function addExercise() {
    if (!exerciseName.trim()) return;

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
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Exercise name"
          value={exerciseName}
          onChange={(e) => setExerciseName(e.target.value)}
          className="flex-1 rounded border p-3"
        />
<input
  type="number"
  min="1"
  placeholder="Target BPM"
  value={targetBpm}
  onChange={(e) =>
    setTargetBpm(Number(e.target.value))
  }
  className="w-32 rounded border p-3"
/>
        <select
  value={lifetimeGoalMinutes}
  onChange={(e) =>
    setLifetimeGoalMinutes(Number(e.target.value))
  }
  className="w-40 rounded border p-3"
>
  <option value={100}>100 minutes</option>
  <option value={500}>500 minutes</option>
  <option value={1000}>1000 minutes</option>
</select>
        

        <button
          onClick={addExercise}
          disabled={saving}
          className="rounded bg-blue-600 px-6 py-3 text-white disabled:opacity-50"
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