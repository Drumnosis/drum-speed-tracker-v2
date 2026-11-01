export type PracticeExercise = {
  id: string; name: string; target_bpm: number; bpm: number; duration: number;
  sessionId: string;
};
export type PendingSession = {
  client_session_id: string; exercise_id: string; bpm: number; minutes: number; created_at: string;
};
export type Phase = "ready" | "countIn" | "running" | "paused" | "rest" | "restPaused" | "complete";
export type PracticeState = {
  version: 1; routine: PracticeExercise[]; index: number; phase: Phase;
  remainingMs: number; restMs: number; countMs: number; subdivision: number;
  pending: PendingSession[];
};

export function createPractice(routine: PracticeExercise[], pending: PendingSession[] = []): PracticeState {
  return { version: 1, routine, index: 0, phase: routine.length ? "ready" : "complete",
    remainingMs: (routine[0]?.duration ?? 0) * 60000, restMs: 15000, countMs: 0, subdivision: 1, pending };
}

export function nextExercise(state: PracticeState, countIn = true): PracticeState {
  const index = state.index + 1;
  const exercise = state.routine[index];
  if (!exercise) return { ...state, phase: "complete" };
  return { ...state, index, phase: countIn ? "countIn" : "ready", remainingMs: exercise.duration * 60000,
    restMs: 15000, countMs: 0 };
}

// A tick crosses at most one phase boundary: a delayed browser callback must
// never silently practise or complete subsequent exercises.
export function advancePractice(state: PracticeState, elapsedMs: number, now: number): PracticeState {
  const elapsed = Math.max(0, elapsedMs);
  const exercise = state.routine[state.index];
  if (!exercise) return state;
  if (state.phase === "countIn") {
    const countMs = state.countMs + elapsed;
    return countMs >= 4 * 60000 / exercise.bpm
      ? { ...state, phase: "running", countMs: 0 }
      : { ...state, countMs };
  }
  if (state.phase === "rest") {
    const restMs = Math.max(0, state.restMs - elapsed);
    return restMs === 0 ? nextExercise(state) : { ...state, restMs };
  }
  if (state.phase !== "running") return state;
  const remainingMs = Math.max(0, state.remainingMs - elapsed);
  if (remainingMs > 0) return { ...state, remainingMs };
  const pending = state.pending.some(item => item.client_session_id === exercise.sessionId)
    ? state.pending : [...state.pending, { client_session_id: exercise.sessionId,
      exercise_id: exercise.id, bpm: exercise.bpm, minutes: exercise.duration,
      created_at: new Date(now).toISOString() }];
  return { ...state, remainingMs: 0, pending, restMs: 15000,
    phase: state.index < state.routine.length - 1 ? "rest" : "complete" };
}

export function changePracticeBpm(state: PracticeState, bpm: number): PracticeState {
  if (!Number.isFinite(bpm)) return state;
  return { ...state, routine: state.routine.map((item, index) => index === state.index
    ? { ...item, bpm: Math.max(30, Math.min(300, Math.round(bpm))) } : item) };
}

export function togglePractice(state: PracticeState): PracticeState {
  const phases: Partial<Record<Phase, Phase>> = {
    ready: "countIn", running: "paused", paused: "countIn", rest: "restPaused", restPaused: "rest",
  };
  return { ...state, phase: phases[state.phase] ?? state.phase, countMs: 0 };
}

export function parsePractice(raw: string | null): PracticeState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as PracticeState;
    if (s.version !== 1 || !Array.isArray(s.routine) || !s.routine.length ||
      !Number.isInteger(s.index) || s.index < 0 || s.index >= s.routine.length ||
      !["ready", "countIn", "running", "paused", "rest", "restPaused", "complete"].includes(s.phase) ||
      ![1, 2, 3, 4].includes(s.subdivision) ||
      ![s.remainingMs, s.restMs, s.countMs].every(n => Number.isFinite(n) && n >= 0) ||
      !s.routine.every(e => typeof e.id === "string" && typeof e.sessionId === "string" &&
        typeof e.name === "string" && Number.isFinite(e.bpm) && e.bpm >= 30 && e.bpm <= 300 &&
        Number.isFinite(e.duration) && e.duration > 0) || !Array.isArray(s.pending) ||
      !s.pending.every(p => typeof p.client_session_id === "string" && typeof p.exercise_id === "string" &&
        Number.isFinite(p.bpm) && p.bpm > 0 && Number.isFinite(p.minutes) && p.minutes > 0 &&
        Number.isFinite(Date.parse(p.created_at)))) return null;
    return s;
  } catch { return null; }
}
