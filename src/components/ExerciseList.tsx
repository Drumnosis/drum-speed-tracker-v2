"use client";

import { useState } from "react";
import { supabase } from "@/services/supabase";
import LogSessionModal from "@/components/LogSessionModal";
import ExerciseStats from "@/components/ExerciseStats";
import BpmProgressChart from "@/components/BpmProgressChart";
import SessionHistory from "@/components/SessionHistory";
import EditGrooveScribeLink from "@/components/EditGrooveScribeLink";
import GrooveNotation from "@/components/GrooveNotation";
import { calculateExerciseStats } from "@/utils/exerciseStats";
import type { Exercise, DrumSession } from "@/types";

type ExerciseListProps = {
  exercises: Exercise[];
  sessions: DrumSession[];
  onExercisesChanged: () => Promise<void>;
  readOnly?: boolean;
};

export default function ExerciseList({
  exercises,
  sessions,
  onExercisesChanged,
  readOnly = false,
}: ExerciseListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [selectedExerciseName, setSelectedExerciseName] = useState("");

async function deleteExercise(id: string) {
  if (!confirm("Delete this exercise?")) {
    return;
  }

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
        No exercises yet.
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
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {exercise.name}
                </h3>
                <button onClick={() => logSession(exercise.id, exercise.name)}
                  className="rounded bg-blue-600 px-3 py-2 text-white">Log practice</button>

                {!readOnly && (
                  <div className="flex gap-2">
                    

                    <button
                      onClick={() => deleteExercise(exercise.id)}
                      disabled={deletingId === exercise.id}
                      className="rounded bg-red-600 px-3 py-2 text-white"
                    >
                      {deletingId === exercise.id
                        ? "Deleting..."
                        : "Delete"}
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
