"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";

type RoutineExercise = {
  id: string;
  name: string;
  target_bpm: number;
  bpm: number;
  duration: number;
};

type PracticePlayerProps = {
  onExit: () => void;
  onSessionSaved: () => Promise<void>;
};

export default function PracticePlayer({
  onExit,
  onSessionSaved,
}: PracticePlayerProps) {
  const [routine, setRoutine] = useState<RoutineExercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] =
    useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInBeat, setCountInBeat] = useState(0);
const [isResting, setIsResting] = useState(false);
const [restSeconds, setRestSeconds] = useState(15);

useEffect(() => {
  if (!isResting) {
    return;
  }
if (restSeconds === 0) {
  setIsResting(false);
  setRestSeconds(15);
  setCurrentIndex((current) => current + 1);
  setTimeout(() => {
    setIsCountingIn(true);
  }, 0);
  return;
}

  const timer = window.setTimeout(() => {
    setRestSeconds((current) => current - 1);
  }, 1000);

  return () => window.clearTimeout(timer);
}, [isResting, restSeconds]);
  
  const audioContextRef =
    useRef<AudioContext | null>(null);

  const beatRef = useRef(0);

  const exercise = routine[currentIndex] ?? null;

  useEffect(() => {
    loadRoutine();
  }, []);

  useEffect(() => {
    if (!exercise) {
      return;
    }

    setSecondsRemaining(exercise.duration * 60);
    setIsRunning(false);
    setCountInBeat(0);

    if (isResting) {
      return;
    }

    if (currentIndex > 0) {
      setIsCountingIn(true);
    } else {
      setIsCountingIn(false);
    }
  }, [currentIndex, exercise, isResting]);

  useEffect(() => {
    if (!isCountingIn || !exercise) {
      return;
    }

    let beat = 1;

    const interval =
      (60 / exercise.bpm) * 1000;

    setCountInBeat(1);
    playClick(true);

    const countInTimer = window.setInterval(() => {
      beat += 1;

      if (beat <= 4) {
        setCountInBeat(beat);
        playClick(beat === 1);
        return;
      }

      window.clearInterval(countInTimer);
      setIsCountingIn(false);
      setCountInBeat(0);
      setIsRunning(true);
    }, interval);

    return () => window.clearInterval(countInTimer);
  }, [isCountingIn, exercise]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsRemaining((current) =>
        Math.max(current - 1, 0)
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || !exercise || isResting) {
  return;
}

    const interval =
      (60 / exercise.bpm) * 1000;

    beatRef.current = 1;
    playClick(true);

    const metronome = window.setInterval(() => {
      beatRef.current =
        beatRef.current === 4
          ? 1
          : beatRef.current + 1;

      playClick(beatRef.current === 1);
    }, interval);

    return () =>
      window.clearInterval(metronome);
}, [isRunning, exercise, isResting]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

if (secondsRemaining > 0) {
  return;
}

saveSession();

setIsRunning(false);

if (currentIndex < routine.length - 1) {
  setIsResting(true);
  setRestSeconds(15);
  return;
}

setIsRunning(false);
setIsCountingIn(false);
setIsResting(false);

alert(
  `Routine complete!\n\n` +
    `Exercises completed: ${routine.length}\n` +
    `Great work!`
);

setCurrentIndex(0);
  }, [
    secondsRemaining,
    currentIndex,
    routine.length,
    isRunning,
  ]);
async function saveSession() {
  if (!exercise) {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { error } = await supabase
  .from("drum_sessions")
  .insert({
    user_id: user.id,
    exercise_id: exercise.id,
    bpm: exercise.bpm,
    minutes: exercise.duration,
  });

if (error) {
  alert(`Session did not save: ${error.message}`);
} else {
  await onSessionSaved();
}
}
  function playClick(accent = false) {
    if (!audioContextRef.current) {
      audioContextRef.current =
        new AudioContext();
    }

    const context = audioContextRef.current;

    const oscillator =
      context.createOscillator();

    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.value =
      accent ? 1600 : 1000;

    gain.gain.value =
      accent ? 0.25 : 0.15;

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + 0.03);
  }

  async function loadRoutine() {
        const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { data: routineData } = await supabase
      .from("practice_routines")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!routineData) {
      return;
    }

    const { data: items } = await supabase
      .from("practice_routine_items")
      .select("exercise_id, bpm, duration")
      .eq("routine_id", routineData.id)
      .order("position");

    if (!items) {
      return;
    }

    const loaded: RoutineExercise[] = [];

    for (const item of items) {
      const { data: exerciseData } = await supabase
        .from("exercises")
        .select("id, name, target_bpm")
        .eq("id", item.exercise_id)
        .single();

      if (!exerciseData) {
        continue;
      }

      loaded.push({
        ...exerciseData,
        bpm: item.bpm,
        duration: item.duration,
      });
    }

    setRoutine(loaded);
  }
function changeCurrentBpm(newBpm: number) {
  setRoutine((currentRoutine) =>
    currentRoutine.map((item, index) =>
      index === currentIndex
        ? { ...item, bpm: newBpm }
        : item
    )
  );
}
  function formatTime(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  function toggleTimer() {
    if (!exercise) {
      return;
    }

    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume();
    }

    if (!isRunning && !isCountingIn) {
      setIsCountingIn(true);
      return;
    }

    if (isRunning) {
      setIsRunning(false);
    }
  }

  function exitPractice() {
    setIsRunning(false);
    setIsCountingIn(false);
    setCurrentIndex(0);
    onExit();
  }

  return (
   <section className="rounded-xl bg-white p-4 shadow-md dark:bg-gray-900 dark:text-gray-100 sm:p-8">
      <h2 className="text-2xl font-semibold">
        Practice Routine
      </h2>

      <div className="mt-4 text-center text-gray-500">
        {routine.length > 0
          ? `Exercise ${currentIndex + 1} of ${routine.length}`
          : "Loading..."}
      </div>

      <div className="mt-10 text-center">
        <p className="text-sm uppercase tracking-wide text-gray-500">
          Exercise
        </p>

        <h3 className="mt-2 text-3xl font-bold">
          {exercise?.name ?? "Loading..."}
        </h3>

        <p className="mt-6 text-lg text-gray-600">
          Practice BPM
        </p>

        <p className="text-6xl font-bold text-blue-600">
          {exercise?.bpm ?? "--"}
        </p>
        <button
  onClick={() =>
    changeCurrentBpm(Math.max(30, (exercise?.bpm ?? 120) - 5))
  }
  disabled={isRunning || isCountingIn || !exercise}
  className="mr-2 rounded border border-gray-700 bg-gray-200 px-5 py-3 text-lg font-semibold"
>
  -5
</button>
<button
  onClick={() =>
    changeCurrentBpm(Math.max(30, (exercise?.bpm ?? 120) - 1))
  }
  disabled={isRunning || isCountingIn || !exercise}
  className="mr-2 rounded border border-gray-700 bg-gray-200 px-5 py-3 text-lg font-semibold"
>
  -1
</button>
<input
  type="range"
  min="30"
  max="300"
  value={exercise?.bpm ?? 120}
  onChange={(e) =>
    changeCurrentBpm(Number(e.target.value))
  }
  disabled={isRunning || isCountingIn || !exercise}
  className="mt-4 w-full max-w-md"
/>
<button
  onClick={() =>
    changeCurrentBpm(Math.min(300, (exercise?.bpm ?? 120) + 5))
  }
  disabled={isRunning || isCountingIn || !exercise}
 className="ml-2 rounded border border-gray-700 bg-gray-200 px-5 py-3 text-lg font-semibold"
>
  +5
</button>
<button
  onClick={() =>
    changeCurrentBpm(Math.min(300, (exercise?.bpm ?? 120) + 1))
  }
  disabled={isRunning || isCountingIn || !exercise}
className="ml-2 rounded border border-gray-700 bg-gray-200 px-5 py-3 text-lg font-semibold"
>
  +1
</button>
        <p className="mt-8 text-lg text-gray-600">
  {isResting ? "Rest" : "Time Remaining"}
</p>

<p className="text-5xl font-bold">
  {isResting
    ? `${restSeconds}s`
    : formatTime(secondsRemaining)}
</p>

        {isCountingIn && (
          <p className="mt-6 text-4xl font-bold text-green-600">
            Count In: {countInBeat}
          </p>
        )}

        <div className="mt-10 flex justify-center gap-4">
          <button
            onClick={toggleTimer}
            disabled={!exercise}
            className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white disabled:bg-gray-400"
          >
            {isRunning
              ? "Pause"
              : isCountingIn
              ? "Counting In..."
              : "Start"}
          </button>

          <button
            onClick={exitPractice}
            className="rounded-lg bg-gray-600 px-6 py-3 font-semibold text-white"
          >
            Exit
          </button>
        </div>
      </div>
    </section>
  );
}
