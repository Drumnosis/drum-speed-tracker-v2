"use client";

import type { Exercise } from "@/types";

export type RoutineExercise = Exercise & {
  bpm: number;
  duration: number;
};

type Props = {
  exercise: RoutineExercise;
  index: number;
  total: number;
  onUpdate: (
    id: string,
    field: "bpm" | "duration",
    value: number
  ) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
};

export default function RoutineExerciseCard({
  exercise,
  index,
  total,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onRemove,
}: Props) {
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{exercise.name}</h3>

          <p className="text-sm text-gray-500">
            Target BPM: {exercise.target_bpm}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRemove(exercise.id)}
          className="rounded border px-3 py-1 text-sm hover:bg-gray-100"
        >
          Remove
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">
            Practice BPM
          </label>

          <input
            type="number"
            min={1}
            value={exercise.bpm}
            onChange={(e) =>
              onUpdate(
                exercise.id,
                "bpm",
                Number(e.target.value)
              )
            }
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Duration (minutes)
          </label>

          <input
            type="number"
            min={1}
            value={exercise.duration}
            onChange={(e) =>
              onUpdate(
                exercise.id,
                "duration",
                Number(e.target.value)
              )
            }
            className="w-full rounded border px-3 py-2"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMoveUp(exercise.id)}
          className="rounded border px-4 py-3 text-2xl font-bold disabled:opacity-40"
        >
          ↑
        </button>

        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMoveDown(exercise.id)}
          className="rounded border px-4 py-3 text-2xl font-bold disabled:opacity-40"
        >
          ↓
        </button>
      </div>
    </div>
  );
}