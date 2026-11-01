"use client";

import { useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { createClientId } from "@/utils/clientId";

type Props = {
  open: boolean; exerciseId: string; exerciseName: string;
  onClose: () => void; onSessionSaved: () => Promise<void>;
};
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export default function LogSessionModal({ open, exerciseId, exerciseName, onClose, onSessionSaved }: Props) {
  const [bpm, setBpm] = useState("");
  const [minutes, setMinutes] = useState("");
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ client_session_id: string; bpm: number; minutes: number; created_at: string } | null>(null);
  const inFlight = useRef(false);
  if (!open) return null;

  async function saveSession(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const dateValue = new Date(`${date}T12:00:00`);
    if (!Number.isFinite(Number(bpm)) || Number(bpm) <= 0 || !Number.isFinite(Number(minutes)) ||
      Number(minutes) <= 0 || !date || !Number.isFinite(dateValue.getTime()) || date > today()) {
      setError("Enter a positive BPM, positive minutes and a valid date up to today."); return;
    }
    inFlight.current = true; setSaving(true); setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("You are not signed in.");
      setLocked(true);
      request.current ??= { client_session_id: createClientId(), bpm: Number(bpm), minutes: Number(minutes), created_at: dateValue.toISOString() };
      const { error: saveError } = await supabase.from("drum_sessions").upsert({
        ...request.current, user_id: user.id, exercise_id: exerciseId,
      }, { onConflict: "user_id,client_session_id", ignoreDuplicates: true });
      if (saveError) throw saveError;
      await onSessionSaved();
      onClose();
    } catch (err) {
      setError(`${err instanceof Error ? err.message : String((err as { message?: string }).message ?? err)}. Retry uses the same entry to prevent duplicates.`);
    } finally { inFlight.current = false; setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="log-title">
    <form onSubmit={saveSession} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 text-gray-900 shadow-xl dark:bg-gray-900 dark:text-gray-100">
      <h2 id="log-title" className="text-2xl font-bold">Log practice</h2>
      <p className="mt-2">{exerciseName}</p>
      <p className="mt-2 text-sm">Choose the exercise using its Log practice button. Manual entries count towards Statistics.</p>
      <label className="mt-5 block" htmlFor="manual-bpm">BPM</label>
      <input id="manual-bpm" required type="number" min="1" step="1" value={bpm} disabled={saving || locked}
        onChange={e => setBpm(e.target.value)} className="mt-1 w-full rounded border p-3" autoFocus />
      <label className="mt-4 block" htmlFor="manual-minutes">Minutes practised</label>
      <input id="manual-minutes" required type="number" min="0.01" step="0.01" value={minutes} disabled={saving || locked}
        onChange={e => setMinutes(e.target.value)} className="mt-1 w-full rounded border p-3" />
      <label className="mt-4 block" htmlFor="manual-date">Date</label>
      <input id="manual-date" required type="date" max={today()} value={date} disabled={saving || locked}
        onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded border p-3" />
      {error && <p role="alert" className="mt-3 text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} disabled={saving} className="rounded bg-gray-200 px-4 py-3 text-gray-900">Cancel</button>
        <button type="submit" disabled={saving} className="rounded bg-green-600 px-4 py-3 text-white">{saving ? "Saving…" : "Save session"}</button>
      </div>
    </form>
  </div>;
}
