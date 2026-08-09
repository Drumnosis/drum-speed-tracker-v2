"use client";

import { useState } from "react";
import { supabase } from "@/services/supabase";

type LogSessionModalProps = {
  open: boolean;
  exerciseId: string;
  exerciseName: string;
  onClose: () => void;
  onSessionSaved: () => Promise<void>;
};

export default function LogSessionModal({
  open,
  exerciseId,
  exerciseName,
  onClose,
  onSessionSaved,
}: LogSessionModalProps) {
  const [bpm, setBpm] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return null;
  }

  async function saveSession() {
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("drum_sessions").insert({
      user_id: user.id,
      exercise_id: exerciseId,
      bpm: Number(bpm),
      minutes: Number(minutes),
    });

    if (!error) {
      setBpm("");
      setMinutes("");
      await onSessionSaved();
      onClose();
    } else {
      console.error(error);
    }

    setSaving(false);
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-2xl font-bold">
          Log Session
        </h2>

        <p className="mt-2 text-gray-600">
          {exerciseName}
        </p>

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium">
            BPM
          </label>

          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(e.target.value)}
            className="w-full rounded border p-3"
          />
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">
            Minutes
          </label>

          <input
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-full rounded border p-3"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded bg-gray-300 px-4 py-2"
          >
            Cancel
          </button>

          <button
            onClick={saveSession}
            disabled={saving}
            className="rounded bg-green-600 px-4 py-2 text-white"
          >
            {saving ? "Saving..." : "Save Session"}
          </button>
        </div>
      </div>
    </div>
  );
}