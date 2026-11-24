"use client";

import { useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { practiceIdentity } from "@/services/practiceIdentity";
import LogSessionModal from "@/components/LogSessionModal";
import ExerciseStats from "@/components/ExerciseStats";
import BpmProgressChart from "@/components/BpmProgressChart";
import SessionHistory from "@/components/SessionHistory";
import EditGrooveScribeLink from "@/components/EditGrooveScribeLink";
import GrooveNotation from "@/components/GrooveNotation";
import EditAutoProgress from "@/components/EditAutoProgress";
import { calculateExerciseStats } from "@/utils/exerciseStats";
import type { Exercise, DrumSession } from "@/types";

type ExerciseListProps = {
  exercises: Exercise[];
  sessions: DrumSession[];
  onExercisesChanged: () => Promise<void>;
  readOnly?: boolean;
  emptyMessage?: string;
};

export default function ExerciseList({
  exercises,
  sessions,
  onExercisesChanged,
  readOnly = false,
  emptyMessage = "No exercises yet.",
}: ExerciseListProps) {
  const [archiveChangeId, setArchiveChangeId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const removeDialog = useRef<HTMLDialogElement>(null);
  const pendingRemovalId = useRef<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [selectedExerciseName, setSelectedExerciseName] = useState("");

  async function changeArchiveStatus(exercise: Exercise) {
    setArchiveChangeId(exercise.id);
    const archived = !exercise.archived;
    try {
      const user = await practiceIdentity(supabase.auth);
      const { error } = await supabase.from("exercises")
        .update({ archived })
        .eq("id", exercise.id)
        .eq("user_id", user.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await onExercisesChanged();
    } catch {
      alert(archived ? "Could not archive exercise. Try again." : "Could not restore exercise. Try again.");
    } finally {
      setArchiveChangeId(null);
    }
  }

  function requestRemoval(id: string) {
    if (!removeDialog.current) return;
    pendingRemovalId.current = id;
    removeDialog.current.showModal();
  }

  function cancelRemoval() {
    pendingRemovalId.current = null;
    removeDialog.current?.close();
  }

  async function confirmRemoval() {
    const id = pendingRemovalId.current;
    cancelRemoval();
    if (id !== null) await deleteExercise(id);
  }

async function deleteExercise(id: string) {
  setDeletingId(id);

  await supabase
    .from("practice_routine_items")
    .delete()
    .eq("exercise_id", id);

  await supabase
    .from("drum_sessions")
    .delete()
    .eq("exercise_id", id);

  const { error } = await supabase
    .from("exercises")
    .delete()
    .eq("id", id);

  if (error) {
    alert(`Could not delete exercise: ${error.message}`);
  } else {
    await onExercisesChanged();
  }

  setDeletingId(null);
}
  function logSession(id: string, name: string) {
    setSelectedExerciseId(id);
    setSelectedExerciseName(name);
    setModalOpen(true);
  }

  if (exercises.length === 0) {
    return (
      <p className="mt-6 text-gray-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      <div className="mt-6 space-y-4">
        {exercises.map((exercise) => {
          const exerciseSessions = sessions.filter(
            (session) => session.exercise_id === exercise.id
          );

          const stats = calculateExerciseStats(
            exerciseSessions,
            exercise.target_bpm,
            exercise.lifetime_goal_minutes
          );

          return (
            <div
              key={exercise.id}
              className="rounded-lg border bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  {exercise.name}
                  {readOnly && exercise.archived && <span className="ml-2 text-sm font-normal">(Archived)</span>}
                </h3>
                <button onClick={() => logSession(exercise.id, exercise.name)}
                  className="rounded bg-blue-600 px-3 py-2 text-white">Log practice</button>

                {!readOnly && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button"
                      onClick={() => void changeArchiveStatus(exercise)}
                      disabled={archiveChangeId !== null || deletingId === exercise.id}
                      className={`rounded border px-3 py-2 disabled:opacity-50 ${exercise.archived
                        ? ""
                        : "border-blue-200 bg-blue-50 font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"}`}>
                      {archiveChangeId === exercise.id ? "Saving…" : exercise.archived ? "Restore" : "Archive"}
                    </button>
                    

                    <button
                      type="button"
                      onClick={() => requestRemoval(exercise.id)}
                      disabled={deletingId === exercise.id || archiveChangeId === exercise.id}
                      className="rounded bg-red-700 px-3 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-50"
                    >
                      {deletingId === exercise.id
                        ? "Deleting..."
                        : "Remove Exercise"}
                    </button>
                  </div>
                )}
              </div>

              {!readOnly && (
                <div className="mt-4 flex items-center gap-3">
                  <label className="text-sm text-gray-600 dark:text-gray-300">
                    Target BPM
                  </label>

                  <span className="font-semibold">
  {exercise.target_bpm} BPM
{stats.best !== null && stats.best >= exercise.target_bpm && (
  <span className="ml-2">✓</span>
)}
</span>
</div>
              )}
              {!readOnly && <p className="mt-3 text-sm">Starting BPM: {exercise.starting_bpm ?? 60}
                {exercise.last_practice_bpm != null && ` · Last practice BPM: ${exercise.last_practice_bpm}`}</p>}
<div className="mt-4 flex items-center gap-3">
  <label className="text-sm text-gray-600">
    Total Time Target
  </label>

  <span className="font-semibold">
    {exercise.lifetime_goal_minutes} minutes
{stats.totalMinutes >= exercise.lifetime_goal_minutes && (
  <span className="ml-2">✓</span>
)}
  </span>
</div>
           

           {!readOnly && (
             <>
               <GrooveNotation key={exercise.groove_scribe_url} url={exercise.groove_scribe_url} />
               <EditGrooveScribeLink
                 exerciseId={exercise.id}
                 url={exercise.groove_scribe_url}
                 onSaved={onExercisesChanged}
               />
               <EditAutoProgress key={`${exercise.id}:${exercise.auto_progress_enabled}:${exercise.auto_progress_after}:${exercise.auto_progress_by}`} exercise={exercise} onSaved={onExercisesChanged} />
             </>
           )}

           {readOnly && (
  <>
    <ExerciseStats
      latest={stats.latest}
      best={stats.best}
      average={stats.average}
      progress={stats.progress}
      remaining={stats.remaining}
      totalMinutes={stats.totalMinutes}
      remainingMinutes={stats.remainingMinutes}
      percentageComplete={stats.percentageComplete}
    />

    <BpmProgressChart
      sessions={exerciseSessions}
      targetBpm={exercise.target_bpm}
    />
    <SessionHistory sessions={exerciseSessions} />


  </>
)}
            </div>
          );
        })}
      </div>

      <dialog ref={removeDialog} aria-labelledby="remove-exercise-title" aria-describedby="remove-exercise-description"
        onCancel={() => { pendingRemovalId.current = null; }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl bg-white p-6 text-gray-900 shadow-xl backdrop:bg-black/60 dark:bg-gray-900 dark:text-gray-100">
        <h2 id="remove-exercise-title" className="text-lg font-semibold">
          Are you sure you want to remove this exercise?
        </h2>
        <p id="remove-exercise-description" className="mt-2 text-sm">
          This permanently deletes the exercise and its practice history and removes it from saved routines.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={cancelRemoval}
            className="rounded border px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          <button type="button" onClick={confirmRemoval}
            className="rounded bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800">Remove</button>
        </div>
      </dialog>

      <LogSessionModal
        key={`${selectedExerciseId}:${modalOpen}`}
        open={modalOpen}
        exerciseId={selectedExerciseId}
        exerciseName={selectedExerciseName}
        onClose={() => setModalOpen(false)}
        onSessionSaved={onExercisesChanged}
      />
    </>
  );
}
