"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase";
import AddExerciseForm from "@/components/AddExerciseForm";
import ExerciseList from "@/components/ExerciseList";
import Navigation from "@/components/Navigation";
import RoutineBuilder from "@/components/RoutineBuilder";
import PracticePlayer from "@/components/PracticePlayer";
import type {
  Exercise,
  DrumSession,
} from "@/types";

type Page = "home" | "exercises" | "practice" | "statistics";

export default function AppShell() {
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [practiceMode, setPracticeMode] = useState<
    "builder" | "player"
  >("builder");

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<DrumSession[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: exerciseData, error: exerciseError } = await supabase
      .from("exercises")
      .select("id, name, target_bpm, lifetime_goal_minutes")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (exerciseError) {
      console.error(exerciseError);
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from("drum_sessions")
      .select("id, exercise_id, bpm, minutes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (sessionError) {
      console.error(sessionError);
      return;
    }

    setExercises(exerciseData ?? []);
    setSessions(sessionData ?? []);
  }
const totalPracticeMinutes = sessions.reduce(
  (total, session) => total + session.minutes,
  0
);
  return (
    <main className="min-h-screen bg-gray-100 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
              Drum Speed Tracker
            </h1>

            <p className="mt-2 text-gray-600">
              Guided deliberate practice
            </p>
          </div>

          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded bg-gray-800 px-4 py-2 text-white"
          >
            Sign Out
          </button>
        </header>

        <Navigation
          currentPage={currentPage}
          onNavigate={setCurrentPage}
        />

        {currentPage === "home" && (
          <section className="rounded-xl bg-white p-6 text-center shadow-md dark:bg-gray-900 dark:text-gray-100 sm:p-10">
            <h2 className="text-3xl font-semibold">
              Ready to practise?
            </h2>
<div className="mx-auto mt-6 max-w-2xl rounded-lg border-2 border-gray-300 p-6 text-left">
  <h3 className="mb-4 text-xl font-semibold">
    How to use Drum Speed Tracker
  </h3>

  <ol className="list-decimal space-y-3 pl-6 text-gray-700 dark:text-gray-300">
    <li>
      Go to <strong>Exercises</strong>, enter the exercise name,
      target BPM and total practice-time target, then click
      <strong> Add Exercise</strong>.
    </li>

    <li>
      Go to <strong>Practice</strong> and choose the exercises you
      want to include in your routine.
    </li>

    <li>
      Set the BPM and practice duration for each exercise.
    </li>

    <li>
      Use the up and down arrows to put the exercises in the order
      you want.
    </li>

    <li>
      Click <strong>Save Routine</strong> when you are happy with it.
    </li>

    <li>
      Click <strong>Start Routine</strong>. You can adjust the BPM
      before each exercise, then press <strong>Start</strong>.
      Your practice time and BPM will be recorded automatically.
    </li>
  </ol>
</div>
            <button
              onClick={() => {
                setCurrentPage("practice");
                setPracticeMode("player");
              }}
              className="mt-8 w-full rounded-lg bg-blue-600 py-4 text-lg font-semibold text-white"
            >
              Start Routine
            </button>
          </section>
        )}

        {currentPage === "exercises" && (
          <section className="rounded-xl bg-white p-4 shadow-md dark:bg-gray-900 dark:text-gray-100 sm:p-8">
            <h2 className="mb-6 text-2xl font-semibold">
              Exercises
            </h2>

            <AddExerciseForm onExerciseAdded={loadData} />

            <ExerciseList
              exercises={exercises}
              sessions={sessions}
              onExercisesChanged={loadData}
            />
          </section>
        )}
{currentPage === "practice" && (
  <>
    {practiceMode === "builder" ? (
      <>
        <div className="mb-4 flex justify-end">
          <button
            onClick={() =>
              setPracticeMode("player")
            }
            className="rounded bg-green-600 px-4 py-2 text-white"
          >
            Start Routine
          </button>
        </div>

        <RoutineBuilder exercises={exercises} />
      </>
    ) : (
      <PracticePlayer
        onExit={() =>
          setPracticeMode("builder")
        }
        onSessionSaved={loadData}
      />
    )}
  </>
)}

{currentPage === "statistics" && (
 <section className="rounded-xl bg-white p-4 shadow-md dark:bg-gray-900 dark:text-gray-100 sm:p-8">
    <h2 className="text-2xl font-semibold">
      Statistics
    </h2>

    <p className="mt-2 text-lg font-semibold">
      Total Practice: {totalPracticeMinutes} minutes
    </p>

    <ExerciseList
      exercises={exercises}
      sessions={sessions}
      onExercisesChanged={loadData}
      readOnly
    />
  </section>
)}
      </div>
    </main>
  );
}