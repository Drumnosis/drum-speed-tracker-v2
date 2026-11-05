"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase";
import AddExerciseForm from "@/components/AddExerciseForm";
import ExerciseList from "@/components/ExerciseList";
import Navigation from "@/components/Navigation";
import RoutineBuilder from "@/components/RoutineBuilder";
import PracticePlayer from "@/components/PracticePlayer";
import { parsePractice } from "@/utils/practiceState";
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
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [playingRoutineId, setPlayingRoutineId] = useState<string | null>(null);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<DrumSession[]>([]);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;
    try {
      const saved = parsePractice(localStorage.getItem(`drum-practice:v1:${user.id}`));
      setHasRecovery(!!saved && (saved.phase !== "complete" || saved.pending.length > 0));
    } catch { /* Practice will explain if recovery storage is unavailable. */ }

    const { data: exerciseData, error: exerciseError } = await supabase
      .from("exercises")
      .select("id, name, target_bpm, starting_bpm, last_practice_bpm, lifetime_goal_minutes, groove_scribe_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (exerciseError) {
      console.error(exerciseError);
      setDataError(`Could not load exercises: ${exerciseError.message}. Apply the supplied Supabase migration before testing this update.`);
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from("drum_sessions")
      .select("id, exercise_id, bpm, minutes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (sessionError) {
      console.error(sessionError);
      setDataError(`Could not load sessions: ${sessionError.message}`);
      return;
    }

    setExercises(exerciseData ?? []);
    setSessions(sessionData ?? []);
    setDataError("");
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
          onNavigate={(page) => {
            if (currentPage === "practice" && practiceMode === "player" && page !== "practice") {
              void loadData();
            }
            setCurrentPage(page);
          }}
        />
        {dataError && <p role="alert" className="mb-4 text-red-600">{dataError}</p>}
        {hasRecovery && !(currentPage === "practice" && practiceMode === "player") && (
          <div className="mb-4 rounded-lg border border-blue-500 p-4 dark:text-gray-100">
            <p>You have saved practice to continue, or completed exercises waiting to save.</p>
            <button className="mt-2 rounded bg-blue-600 px-4 py-3 text-white"
              onClick={() => {
                setPlayingRoutineId(null);
                setCurrentPage("practice");
                setPracticeMode("player");
              }}>Continue saved practice</button>
          </div>
        )}

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
      starting BPM, target BPM and total practice-time target, then click
      <strong> Add Exercise</strong>.
    </li>

    <li>
      Go to <strong>Practice</strong>, choose <strong>New Routine</strong>,
      then name it and add exercises.
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
                setPracticeMode("builder");
              }}
              className="mt-8 w-full rounded-lg bg-blue-600 py-4 text-lg font-semibold text-white"
            >
              Choose a Routine
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
      <RoutineBuilder
        exercises={exercises}
        preferredRoutineId={selectedRoutineId}
        hasRecovery={hasRecovery}
        onStart={(id) => {
          setSelectedRoutineId(id);
          setPlayingRoutineId(id);
          setPracticeMode("player");
        }}
      />
    ) : (
      <PracticePlayer
        routineId={playingRoutineId}
        exercises={exercises}
        onExit={() =>
          { setPracticeMode("builder"); void loadData(); }
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
