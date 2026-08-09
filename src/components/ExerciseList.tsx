"use client";

import { useState } from "react";
import { supabase } from "@/services/supabase";
import LogSessionModal from "@/components/LogSessionModal";
import ExerciseStats from "@/components/ExerciseStats";
import BpmProgressChart from "@/components/BpmProgressChart";
import SessionHistory from "@/components/SessionHistory";
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
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [selectedExerciseName, setSelectedExerciseName] = useState("");

  async function updateTargetBpm(
    id: string,
    targetBpm: number
  ) {
    setSavingId(id);

    const { error } = await supabase
      .from("exercises")
      .update({
        target_bpm: targetBpm,
      })
      .eq("id", id);

    if (!error) {
      await onExercisesChanged();
    }

    setSavingId(null);
  }
async function updateLifetimeGoal(
  id: string,
  lifetimeGoalMinutes: number
) {
  setSavingId(id);

  const { error } = await supabase
    .from("exercises")
    .update({
      lifetime_goal_minutes: lifetimeGoalMinutes,
    })
    .eq("id", id);

  if (!error) {
    await onExercisesChanged();
  }

  setSavingId(null);
}
  async function deleteExercise(id: string) {
    if (!confirm("Delete this exercise?")) {
      return;
    }

    setDeletingId(id);

    const { error } = await supabase
      .from("exercises")
      .delete()
      .eq("id", id);

    if (!error) {
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
              className="rounded-lg border bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {exercise.name}
                </h3>

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
                  <label className="text-sm text-gray-600">
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


  </>
)}
            </div>
          );
        })}
      </div>

      <LogSessionModal
        open={modalOpen}
        exerciseId={selectedExerciseId}
        exerciseName={selectedExerciseName}
        onClose={() => setModalOpen(false)}
        onSessionSaved={onExercisesChanged}
      />
    </>
  );
}