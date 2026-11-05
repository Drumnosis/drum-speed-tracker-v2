"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { createClientId } from "@/utils/clientId";
import type { Exercise, PracticeRoutine, PracticeRoutineItem } from "@/types";

import RoutineHeader from "./RoutineHeader";
import RoutineExerciseCard from "./RoutineExerciseCard";
import RoutineAddExercise from "./RoutineAddExercise";
import RoutineSaveButton from "./RoutineSaveButton";

type SavedRoutine = Pick<PracticeRoutine, "id" | "name">;
type RoutineItem = Pick<PracticeRoutineItem, "exercise_id" | "bpm" | "duration">;
type Draft = { id: string | null; name: string; items: RoutineItem[] };

type RoutineBuilderProps = {
  exercises: Exercise[];
  preferredRoutineId: string | null;
  hasRecovery: boolean;
  onStart: (id: string) => void;
};

const emptyDraft: Draft = { id: null, name: "", items: [] };

async function loadDraft(routine: SavedRoutine): Promise<Draft> {
  const { data, error } = await supabase
    .from("practice_routine_items")
    .select("exercise_id, bpm, duration")
    .eq("routine_id", routine.id)
    .order("position");

  if (error) throw error;
  return { ...routine, items: data };
}

export default function RoutineBuilder({
  exercises,
  preferredRoutineId,
  hasRecovery,
  onStart,
}: RoutineBuilderProps) {
  const [savedRoutines, setSavedRoutines] = useState<SavedRoutine[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [itemsChanged, setItemsChanged] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const editedBpms = useRef(new Set<string>());
  const newRoutineId = useRef<string | null>(null);
  const userId = useRef("");

  useEffect(() => {
    let cancelled = false;
    async function loadRoutines() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user || cancelled) return;
        userId.current = user.id;

        const { data, error } = await supabase
          .from("practice_routines")
          .select("id, name")
          .eq("user_id", user.id)
          .order("created_at")
          .order("id");
        if (error) throw error;
        const selected = data.find(routine => routine.id === preferredRoutineId) ?? data[0];
        const loaded = selected ? await loadDraft(selected) : emptyDraft;
        if (cancelled) return;
        setSavedRoutines(data);
        setDraft(loaded);
        setReady(true);
      } catch {
        if (!cancelled) setError("Could not load saved routines. Reopen Practice to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadRoutines();
    return () => { cancelled = true; };
  }, [preferredRoutineId]);

  const availableExercises = exercises.filter(
    exercise => !draft.items.some(item => item.exercise_id === exercise.id)
  );
  const savedName = savedRoutines.find(routine => routine.id === draft.id)?.name ?? "";
  const dirty = itemsChanged || draft.name !== savedName;

  function resetDraft(next: Draft) {
    setDraft(next);
    setItemsChanged(false);
    editedBpms.current.clear();
    newRoutineId.current = null;
  }

  async function chooseRoutine(id: string) {
    if (dirty && !window.confirm("Discard unsaved routine changes?")) return;
    setError("");
    setStatus("");
    const selected = savedRoutines.find(routine => routine.id === id);
    if (!selected) {
      resetDraft(emptyDraft);
      return;
    }

    setLoading(true);
    try {
      resetDraft(await loadDraft(selected));
    } catch {
      setError("Could not load that routine. Try selecting it again.");
    } finally {
      setLoading(false);
    }
  }

  function updateItems(items: RoutineItem[]) {
    setDraft({ ...draft, items });
    setItemsChanged(true);
    setStatus("");
  }

  function addExercise(id: string) {
    const exercise = availableExercises.find(exercise => exercise.id === id);
    if (!exercise) return;
    updateItems([...draft.items, {
      exercise_id: id,
      bpm: exercise.last_practice_bpm ?? exercise.starting_bpm ?? 60,
      duration: 5,
    }]);
  }

  function updateExercise(id: string, field: "bpm" | "duration", value: number) {
    if (field === "bpm") editedBpms.current.add(id);
    updateItems(draft.items.map(item =>
      item.exercise_id === id ? { ...item, [field]: value } : item
    ));
  }

  function removeExercise(id: string) {
    editedBpms.current.delete(id);
    updateItems(draft.items.filter(item => item.exercise_id !== id));
  }

  function moveExercise(id: string, offset: number) {
    const index = draft.items.findIndex(item => item.exercise_id === id);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= draft.items.length) return;
    const items = [...draft.items];
    [items[index], items[next]] = [items[next], items[index]];
    updateItems(items);
  }

  async function saveRoutine() {
    const name = draft.name.trim();
    setError("");
    setStatus("");
    if (!name) {
      setError("Enter a routine name.");
      return;
    }
    const saveItems = draft.id === null || itemsChanged;
    if (saveItems && draft.items.some(item => !Number.isFinite(item.bpm) || item.bpm < 30 || item.bpm > 300 ||
      !Number.isFinite(item.duration) || item.duration <= 0)) {
      setError("BPM must be 30–300 and duration must be greater than zero.");
      return;
    }

    setSaving(true);
    try {
      const id = draft.id ?? (newRoutineId.current ??= createClientId());
      const { error } = await supabase.rpc("save_practice_routine", {
        p_id: id,
        p_name: name,
        p_create: draft.id === null,
        p_items: saveItems ? draft.items.map((item, index) => ({
          ...item,
          position: index + 1,
          remember_bpm: editedBpms.current.has(item.exercise_id),
        })) : null,
      });
      if (error) throw error;

      setSavedRoutines(current => draft.id
        ? current.map(routine => routine.id === id ? { id, name } : routine)
        : [...current, { id, name }]
      );
      resetDraft({ ...draft, id, name });
      setStatus("Routine saved.");
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? error.message : "Try again.";
      setError(`Could not save routine. ${detail}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoutine() {
    if (!draft.id) return;
    if (!window.confirm(`Delete “${savedName}” and its routine items? Your exercises and practice history will be kept.`)) return;

    setSaving(true);
    setError("");
    setStatus("");
    try {
      const { error } = await supabase
        .from("practice_routines")
        .delete()
        .eq("id", draft.id)
        .eq("user_id", userId.current)
        .select("id")
        .single();
      if (error) throw error;
      setSavedRoutines(current => current.filter(routine => routine.id !== draft.id));
      resetDraft(emptyDraft);
      setStatus("Routine deleted.");
    } catch {
      setError("Could not delete the routine. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-md dark:bg-gray-900 dark:text-gray-100 sm:p-8">
      <RoutineHeader />

      {ready && (
        <fieldset disabled={loading || saving} className="mt-4 min-w-0 space-y-3 disabled:opacity-60">
          <label className="block text-sm font-medium" htmlFor="saved-routine">Saved routine</label>
          <select
            id="saved-routine"
            value={draft.id ?? ""}
            onChange={event => void chooseRoutine(event.target.value)}
            className="w-full rounded-lg border p-3 dark:bg-gray-800"
          >
            <option value="" disabled>{savedRoutines.length ? "Choose a saved routine" : "No saved routines yet"}</option>
            {savedRoutines.map(routine => (
              <option key={routine.id} value={routine.id}>{routine.name}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void chooseRoutine("")} className="rounded-lg border px-4 py-3">
              New Routine
            </button>
            {draft.id && (
              <button type="button" onClick={() => void deleteRoutine()}
                className="rounded-lg border border-red-600 px-4 py-3 text-red-700 dark:text-red-300">
                Delete Routine
              </button>
            )}
          </div>
          {draft.id && draft.items.length > 0 && (
            <>
              <button
                type="button"
                disabled={dirty || hasRecovery}
                onClick={() => { if (draft.id) onStart(draft.id); }}
                className="w-full rounded-lg bg-green-700 py-4 text-lg font-semibold text-white disabled:bg-gray-500"
              >
                Start Routine
              </button>
              {(dirty || hasRecovery) && (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {hasRecovery ? "Continue or end your saved practice before starting a routine." : "Save your changes before starting."}
                </p>
              )}
            </>
          )}
        </fieldset>
      )}

      {loading && <p role="status" className="mt-6 text-gray-600 dark:text-gray-300">Loading routines…</p>}

      {ready && !loading && (
        <fieldset disabled={saving} className="mt-6 min-w-0 space-y-4 disabled:opacity-60">
          <label className="block font-medium" htmlFor="routine-name">
            {draft.id ? "Routine name (edit to rename)" : "New routine name"}
          </label>
          <input id="routine-name" type="text" value={draft.name}
            placeholder="e.g. Double Bass"
            onChange={event => {
              setDraft({ ...draft, name: event.target.value });
              setStatus("");
            }}
            className="w-full rounded-lg border p-3 dark:bg-gray-800"
          />

          {draft.items.length === 0 && <p className="text-gray-600 dark:text-gray-300">Your routine is empty.</p>}
          {draft.items.map((item, index) => {
            const exercise = exercises.find(exercise => exercise.id === item.exercise_id);
            if (!exercise) return null;
            return (
              <RoutineExerciseCard
                key={exercise.id}
                exercise={{ ...exercise, bpm: item.bpm, duration: item.duration }}
                index={index}
                total={draft.items.length}
                onUpdate={updateExercise}
                onMoveUp={id => moveExercise(id, -1)}
                onMoveDown={id => moveExercise(id, 1)}
                onRemove={removeExercise}
              />
            );
          })}

          <RoutineAddExercise exercises={availableExercises} onAdd={addExercise} />
          <RoutineSaveButton saving={saving} onSave={saveRoutine} />
        </fieldset>
      )}
      {error && <p role="alert" className="mt-4 text-red-700 dark:text-red-300">{error}</p>}
      {status && <p role="status" className="mt-4">{status}</p>}
    </div>
  );
}
