"use client";

import type { Exercise } from "@/types";

type Props = {
  exercises: Exercise[];
  onAdd: (id: string) => void;
};

export default function RoutineAddExercise({
  exercises,
  onAdd,
}: Props) {
  return (
    <div className="mt-8">
      <label className="mb-2 block font-medium">
        Add Exercise
      </label>

      <select
        defaultValue=""
        className="w-full rounded border p-3"
        onChange={(event) => {
          const exerciseId = event.target.value;

          if (!exerciseId) {
            return;
          }

          onAdd(exerciseId);
          event.target.value = "";
        }}
      >
        <option value="">
          Select an exercise...
        </option>

        {exercises.map((exercise) => (
          <option
            key={exercise.id}
            value={exercise.id}
          >
            {exercise.name}
          </option>
        ))}
      </select>
    </div>
  );
}