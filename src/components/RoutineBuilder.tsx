"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabase";
import type { Exercise } from "@/types";

import RoutineHeader from "./RoutineHeader";
import RoutineExerciseCard, {
  type RoutineExercise,
} from "./RoutineExerciseCard";
import RoutineAddExercise from "./RoutineAddExercise";
import RoutineSaveButton from "./RoutineSaveButton";

type RoutineBuilderProps = {
  exercises: Exercise[];
};

export default function RoutineBuilder({
  exercises,
}: RoutineBuilderProps) {
  const [routine, setRoutine] = useState<RoutineExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (exercises.length > 0) {
      loadRoutine();
    }
  }, [exercises]);

  async function loadRoutine() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: routineData } = await supabase
      .from("practice_routines")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!routineData) {
      setLoading(false);
      return;
    }

   const { data: itemData } = await supabase
  .from("practice_routine_items")
  .select("exercise_id, position, bpm, duration")
      .eq("routine_id", routineData.id)
      .order("position");

    if (!itemData) {
      setLoading(false);
      return;
    }

    const loadedRoutine: RoutineExercise[] = [];

    itemData.forEach((item) => {
      const exercise = exercises.find(
        (e) => e.id === item.exercise_id
      );

      if (!exercise) return;

    loadedRoutine.push({
  ...exercise,
  bpm: item.bpm,
  duration: item.duration,
});
    });

    setRoutine(loadedRoutine);
    setLoading(false);
  }

  const availableExercises = useMemo(
    () =>
      exercises.filter(
        (exercise) =>
          !routine.some((r) => r.id === exercise.id)
      ),
    [exercises, routine]
  );

  function addExercise(id: string) {
    const exercise = availableExercises.find(
      (e) => e.id === id
    );

    if (!exercise) return;

    setRoutine((current) => [
      ...current,
      {
        ...exercise,
        bpm: exercise.target_bpm,
        duration: 5,
      },
    ]);
  }

  function updateExercise(
    id: string,
    field: "bpm" | "duration",
    value: number
  ) {
    setRoutine((current) =>
      current.map((exercise) =>
        exercise.id === id
          ? {
              ...exercise,
              [field]: value,
            }
          : exercise
      )
    );
  }

  function removeExercise(id: string) {
    setRoutine((current) =>
      current.filter((exercise) => exercise.id !== id)
    );
  }

  function moveExerciseUp(id: string) {
    setRoutine((current) => {
      const index = current.findIndex(
        (exercise) => exercise.id === id
      );

      if (index <= 0) {
        return current;
      }

      const updated = [...current];

      [updated[index - 1], updated[index]] = [
        updated[index],
        updated[index - 1],
      ];

      return updated;
    });
  }

  function moveExerciseDown(id: string) {
    setRoutine((current) => {
      const index = current.findIndex(
        (exercise) => exercise.id === id
      );

      if (
        index === -1 ||
        index === current.length - 1
      ) {
        return current;
      }

      const updated = [...current];

      [updated[index], updated[index + 1]] = [
        updated[index + 1],
        updated[index],
      ];

      return updated;
    });
  }

  async function saveRoutine() {
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    let routineId: string;

    const { data: existingRoutine } = await supabase
      .from("practice_routines")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (existingRoutine) {
      routineId = existingRoutine.id;
    } else {
      const { data: newRoutine, error } =
        await supabase
          .from("practice_routines")
          .insert({
            user_id: user.id,
            name: "My Routine",
          })
          .select()
          .single();

      if (error || !newRoutine) {
        console.error(error);
        setSaving(false);
        return;
      }

      routineId = newRoutine.id;
    }
        await supabase
      .from("practice_routine_items")
      .delete()
      .eq("routine_id", routineId);

   const items = routine.map((exercise, index) => ({
  routine_id: routineId,
  exercise_id: exercise.id,
  position: index + 1,
  bpm: exercise.bpm,
  duration: exercise.duration,
}));

    if (items.length > 0) {
      await supabase
        .from("practice_routine_items")
        .insert(items);
    }

    setSaving(false);

    alert("Routine saved.");
  }

  return (
    <div className="rounded-xl bg-white p-8 shadow-md">
      <RoutineHeader />

      {loading ? (
        <p className="mt-6 text-gray-500">
          Loading routine...
        </p>
      ) : (
        <>
          <div className="mt-6 space-y-4">
            {routine.length === 0 ? (
              <p className="text-gray-500">
                Your routine is empty.
              </p>
            ) : (
              routine.map((exercise, index) => (
                <RoutineExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  index={index}
                  total={routine.length}
                  onUpdate={updateExercise}
                  onMoveUp={moveExerciseUp}
                  onMoveDown={moveExerciseDown}
                  onRemove={removeExercise}
                />
              ))
            )}
          </div>

          <RoutineAddExercise
            exercises={availableExercises}
            onAdd={addExercise}
          />

          <RoutineSaveButton
            saving={saving}
            onSave={saveRoutine}
          />
        </>
      )}
    </div>
  );
}