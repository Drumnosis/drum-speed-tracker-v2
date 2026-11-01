"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { saveCompletedPractice, savePracticeBpm } from "@/services/practiceSessions";
import { createClientId } from "@/utils/clientId";
import { advancePractice, changePracticeBpm, createPractice, nextExercise, parsePractice, togglePractice,
  type PracticeState, type PracticeExercise } from "@/utils/practiceState";

type Props = { onExit: () => void; onSessionSaved: () => Promise<void> };

export default function PracticePlayer({ onExit, onSessionSaved }: Props) {
  const [state, setState] = useState<PracticeState | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  const [message, setMessage] = useState("");
  const [storageError, setStorageError] = useState("");
  const current = useRef<PracticeState | null>(null);
  const userId = useRef("");
  const blocked = useRef(true);
  const lastTick = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const flushing = useRef(false);
  const active = useRef(true);
  const savedCallback = useRef(onSessionSaved);
  const bpmPending = useRef<Record<string, number>>({});

  useEffect(() => { savedCallback.current = onSessionSaved; }, [onSessionSaved]);

  const store = useCallback((value: PracticeState) => {
    try {
      localStorage.setItem(`drum-practice:v1:${userId.current}`, JSON.stringify(value));
      localStorage.setItem(`drum-bpm-pending:${userId.current}`, JSON.stringify(bpmPending.current));
    } catch { setStorageError("This browser cannot save recovery data. Keep this page open until your sessions are saved."); }
  }, []);

  const commit = useCallback((value: PracticeState) => {
    current.current = value;
    store(value);
    setState(value);
  }, [store]);

  const rememberBpm = useCallback((value: PracticeState) => {
    const exercise = value.routine[value.index];
    if (exercise) bpmPending.current[exercise.id] = exercise.bpm;
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current || !userId.current || !active.current || !current.current) return;
    flushing.current = true;
    try {
      // Inserting with a stable client ID makes retries safe even when the
      // previous response was lost after the database committed the session.
      do {
      while (active.current && current.current?.pending.length) {
        const session = current.current.pending[0];
        await saveCompletedPractice(supabase, userId.current, session);
        if (!active.current) return;
        if (current.current) commit({ ...current.current,
          pending: current.current.pending.filter(p => p.client_session_id !== session.client_session_id) });
        await savedCallback.current();
        if (!active.current) return;
      }
      for (const [id, bpm] of Object.entries(bpmPending.current)) {
        await savePracticeBpm(supabase, userId.current, id, bpm);
        if (!active.current) return;
        if (bpmPending.current[id] === bpm) delete bpmPending.current[id];
        if (current.current) store(current.current);
      }
      } while (current.current?.pending.length);
      setMessage("");
    } catch (error) {
      setMessage(`Save pending: ${error instanceof Error ? error.message : "Connection unavailable"}. Your data is kept on this device; use Retry save after resolving the error or reconnecting.`);
    } finally { flushing.current = false; }
  }, [commit, store]);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    async function load() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user || cancelled) return;
        userId.current = user.id;
        let recovered: PracticeState | null = null;
        try {
          recovered = parsePractice(localStorage.getItem(`drum-practice:v1:${user.id}`));
          const pending = JSON.parse(localStorage.getItem(`drum-bpm-pending:${user.id}`) ?? "{}");
          if (pending && typeof pending === "object") {
            bpmPending.current = Object.fromEntries(Object.entries(pending).filter(([, bpm]) =>
              typeof bpm === "number" && Number.isFinite(bpm) && bpm >= 30 && bpm <= 300)) as Record<string, number>;
          }
        } catch { setStorageError("Recovery storage is unavailable in this browser."); }
        if (recovered && (recovered.phase !== "complete" || recovered.pending.length)) {
          commit(recovered);
          setInterrupted(recovered.phase !== "complete");
          void flush();
          return;
        }
        const { data: routine, error: routineError } = await supabase.from("practice_routines")
          .select("id").eq("user_id", user.id).maybeSingle();
        if (routineError) throw routineError;
        if (!routine) { setMessage("No saved routine. Exit and build a routine first."); return; }
        const { data: items, error: itemsError } = await supabase.from("practice_routine_items")
          .select("exercise_id, bpm, duration").eq("routine_id", routine.id).order("position");
        if (itemsError) throw itemsError;
        const { data: exercises, error: exerciseError } = await supabase.from("exercises")
          .select("id, name, target_bpm, starting_bpm, last_practice_bpm").eq("user_id", user.id);
        if (exerciseError) throw exerciseError;
        if (cancelled) return;
        const loaded: PracticeExercise[] = [];
        for (const item of items ?? []) {
          const exercise = exercises?.find(e => e.id === item.exercise_id);
          if (!exercise) continue;
          const bpm = bpmPending.current[exercise.id] ?? exercise.last_practice_bpm ?? exercise.starting_bpm ?? item.bpm;
          if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300 || !Number.isFinite(item.duration) || item.duration <= 0) {
            throw new Error("Routine BPM must be 30–300 and duration must be greater than zero. Edit and save the routine.");
          }
          loaded.push({ ...exercise, bpm, duration: item.duration, sessionId: createClientId() });
        }
        if (!loaded.length) { setMessage("Your routine is empty. Exit and add exercises first."); return; }
        blocked.current = false;
        lastTick.current = performance.now();
        commit(createPractice(loaded));
      } catch (error) { if (!cancelled) setMessage(`Could not load practice: ${error instanceof Error ? error.message : String(error)}`); }
    }
    void load();
    return () => { cancelled = true; active.current = false; };
  }, [commit, flush]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTick.current;
      lastTick.current = now;
      const value = current.current;
      if (!value || blocked.current || document.hidden) return;
      const next = advancePractice(value, elapsed, Date.now());
      if (next !== value) {
        if (next.phase === "running" && value.phase !== "running") rememberBpm(next);
        commit(next);
        if (next.phase === "running" && value.phase !== "running") void flush();
      }
    }, 100);
    const suspend = () => {
      if (!current.current) return;
      // Freeze at the last foreground tick; never count time spent away.
      blocked.current = true;
      store(current.current);
      setInterrupted(current.current.phase !== "complete");
      void audio.current?.suspend().catch(() => {});
    };
    const visibility = () => { if (document.hidden) suspend(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", suspend);
    window.addEventListener("online", flush);
    const retry = window.setInterval(() => { void flush(); }, 15000);
    return () => {
      window.clearInterval(timer); window.clearInterval(retry);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("online", flush);
      if (current.current) store(current.current);
      void audio.current?.close().catch(() => {}); audio.current = null;
    };
  }, [commit, flush, rememberBpm, store]);

  const pendingCount = state?.pending.length ?? 0;
  const bpm = state?.routine[state.index]?.bpm;
  useEffect(() => { void flush(); }, [pendingCount, bpm, flush]);

  const unlockAudio = () => {
    try {
      const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audio.current && Audio) audio.current = new Audio();
      void audio.current?.resume().catch(() => {});
    } catch { /* Timers work even if audio is unavailable. */ }
  };

  const phase = state?.phase;
  const subdivision = state?.subdivision ?? 1;
  const restSeconds = Math.ceil((state?.restMs ?? 0) / 1000);
  const sound = useCallback((frequency: number, volume: number, rest = false) => {
    if (document.hidden || blocked.current) return;
    const context = audio.current;
    if (!context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = rest ? "sine" : "square";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.035);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(); oscillator.stop(context.currentTime + 0.04);
  }, []);

  // Tie rest pulses to countdown seconds, independently of BPM/subdivision.
  useEffect(() => {
    if (phase === "rest" && !interrupted && restSeconds > 0) sound(550, 0.12, true);
  }, [phase, interrupted, restSeconds, sound]);

  useEffect(() => {
    if (interrupted || !bpm || !["countIn", "running"].includes(phase ?? "")) return;
    let tick = 0;
    const click = () => {
      if (document.hidden || blocked.current) return;
      const context = audio.current;
      if (!context || context.state !== "running") return;
      const main = phase !== "running" || tick % subdivision === 0;
      const accent = tick % (4 * (phase === "running" ? subdivision : 1)) === 0;
      sound(accent ? 1600 : main ? 1000 : 700, accent ? 0.25 : main ? 0.15 : 0.07);
      tick++;
    };
    click();
    const timer = window.setInterval(click, 60000 / bpm / (phase === "running" ? subdivision : 1));
    return () => window.clearInterval(timer);
  }, [phase, bpm, subdivision, interrupted, sound]);

  useEffect(() => {
    if (!phase || phase === "ready" || phase === "complete" || interrupted || !("wakeLock" in navigator)) return;
    let disposed = false;
    let lock: WakeLockSentinel | undefined;
    async function acquire() {
      if (document.hidden || disposed) return;
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (disposed) await acquired.release(); else lock = acquired;
      } catch { /* Unsupported/denied/low battery must not affect practice. */ }
    }
    void acquire();
    const visible = () => { if (!document.hidden) void acquire(); };
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; document.removeEventListener("visibilitychange", visible); void lock?.release().catch(() => {}); };
  }, [phase, interrupted]);

  function changeBpm(value: number) {
    if (!current.current) return;
    const next = changePracticeBpm(current.current, value);
    rememberBpm(next); commit(next);
  }
  function toggle() {
    if (!current.current) return;
    unlockAudio();
    lastTick.current = performance.now();
    const next = togglePractice(current.current);
    rememberBpm(next); commit(next);
    void flush();
  }
  function continuePractice() {
    unlockAudio(); blocked.current = false; lastTick.current = performance.now(); setInterrupted(false);
    if (current.current?.phase === "countIn") commit({ ...current.current, countMs: 0 });
  }
  function skip() {
    if (!current.current || current.current.phase === "rest" || current.current.phase === "restPaused") return;
    lastTick.current = performance.now();
    // Skipping never enqueues a session. The next exercise waits for Start.
    commit(nextExercise(current.current, false));
  }
  function exit() {
    blocked.current = true;
    if (current.current && current.current.phase !== "complete") {
      commit({ ...current.current, phase: current.current.phase === "rest" ? "restPaused" :
        ["running", "countIn"].includes(current.current.phase) ? "paused" : current.current.phase });
    }
    onExit();
  }
  function endRoutine() {
    if (!current.current || !window.confirm("End this routine? Completed exercises are kept; unfinished exercises will not be recorded.")) return;
    blocked.current = true;
    commit({ ...current.current, phase: "complete" });
    setInterrupted(false);
    void flush();
  }

  const exercise = state?.routine[state.index];
  const resting = phase === "rest" || phase === "restPaused";
  const seconds = Math.ceil((resting ? state?.restMs ?? 0 : state?.remainingMs ?? 0) / 1000);
  const button = "rounded-lg px-5 py-3 font-semibold disabled:opacity-40";
  return (
    <section className="rounded-xl bg-white p-4 shadow-md dark:bg-gray-900 dark:text-gray-100 sm:p-8">
      <h2 className="text-2xl font-semibold">Practice Routine</h2>
      {storageError && <p role="alert" className="mt-4 text-amber-600">{storageError}</p>}
      {message && <div role="alert" className="mt-4 text-amber-600">{message}<button onClick={() => void flush()} className="ml-3 underline">Retry save</button></div>}
      {pendingCount > 0 && <p role="status" className="mt-3">{pendingCount} completed exercise(s) waiting to save. Keep this page or return to Practice to retry.</p>}
      {interrupted && <div className="mt-4 rounded border border-blue-500 p-4">
        <p>Your practice is saved. Time away has not been counted. Continue restores the previous running or paused state.</p>
        <button onClick={continuePractice} className={`${button} mt-3 bg-blue-600 text-white`}>Continue practice</button>
        <button onClick={endRoutine} className={`${button} mt-3 text-gray-700 dark:text-gray-300`}>End saved routine</button>
      </div>}
      {phase === "complete" ? <div className="mt-8 text-center"><h3 className="text-2xl font-bold">Routine complete</h3>
        <p className="mt-3">Completed exercises are saved individually. Skipped exercises are not recorded.</p>
        <button onClick={exit} className={`${button} mt-6 bg-gray-600 text-white`}>Back to routine</button></div> : exercise && state ? <>
        <p className="mt-4 text-center">Exercise {state.index + 1} of {state.routine.length}</p>
        <div className="mt-8 text-center">
          <h3 className="text-3xl font-bold">{exercise.name}</h3>
          <p className="mt-6">Practice BPM</p><p className="text-6xl font-bold text-blue-600">{exercise.bpm}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {[-5, -1, 1, 5].map(delta => <button key={delta} aria-label={`Change BPM by ${delta}`} onClick={() => changeBpm(exercise.bpm + delta)}
              disabled={interrupted || phase === "running" || phase === "countIn"} className={`${button} bg-gray-200 text-gray-900`}>{delta > 0 ? "+" : ""}{delta}</button>)}
          </div>
          <input aria-label="Practice BPM" type="range" min="30" max="300" value={exercise.bpm}
            onChange={e => changeBpm(Number(e.target.value))} disabled={interrupted || phase === "running" || phase === "countIn"} className="mt-4 w-full max-w-md" />
          <div className="mt-4"><label htmlFor="subdivision">Metronome: </label>
            <select id="subdivision" value={subdivision} disabled={interrupted || phase === "countIn"}
              onChange={e => { if (current.current) commit({ ...current.current, subdivision: Number(e.target.value) }); }} className="rounded border p-2">
              <option value={1}>Quarter notes</option><option value={2}>Eighth notes</option>
              <option value={3}>Eighth-note triplets</option><option value={4}>Sixteenth notes</option>
            </select></div>
          <p className="mt-8">{resting ? (phase === "restPaused" ? "Rest paused" : "Rest") : "Time remaining"}</p>
          <p className="text-5xl font-bold">{resting ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</p>
          {phase === "countIn" && <p className="mt-6 text-4xl font-bold text-green-600">Count In: {Math.min(4, Math.floor(state.countMs / (60000 / exercise.bpm)) + 1)}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button onClick={toggle} disabled={interrupted || phase === "countIn"} className={`${button} bg-green-600 text-white`}>
              {phase === "restPaused" ? "Resume Rest" : phase === "rest" ? "Pause Rest" : phase === "running" ? "Pause" : phase === "countIn" ? "Counting In…" : phase === "paused" ? "Resume" : "Start"}</button>
            <button onClick={skip} disabled={interrupted || resting} className={`${button} bg-amber-600 text-white`}>Skip</button>
            <button onClick={exit} className={`${button} bg-gray-600 text-white`}>Exit</button>
          </div>
        </div>
      </> : <button onClick={exit} className={`${button} mt-6 bg-gray-600 text-white`}>Exit</button>}
    </section>
  );
}
