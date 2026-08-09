import type {
  DrumSession,
  ExerciseStats,
} from "@/types";

export function calculateExerciseStats(
  sessions: DrumSession[],
  targetBpm: number,
  lifetimeGoalMinutes: number
): ExerciseStats {
  const totalMinutes = sessions.reduce(
    (total, session) => total + session.minutes,
    0
  );

  const remainingMinutes = Math.max(
    lifetimeGoalMinutes - totalMinutes,
    0
  );

  const percentageComplete =
    lifetimeGoalMinutes > 0
      ? Math.min(
          Math.round(
            (totalMinutes / lifetimeGoalMinutes) * 100
          ),
          100
        )
      : 0;

  if (sessions.length === 0) {
    return {
      latest: null,
      best: null,
      average: null,
      progress: null,
      remaining: targetBpm,
      totalMinutes,
      remainingMinutes,
      percentageComplete,
    };
  }

  const sortedSessions = [...sessions].sort(
    (a, b) =>
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
  );

  const latest = sortedSessions[0].bpm;

  const best = Math.max(
    ...sessions.map((session) => session.bpm)
  );

  const average = Math.round(
    sessions.reduce(
      (total, session) => total + session.bpm,
      0
    ) / sessions.length
  );

  const progress =
  targetBpm > 0
    ? Math.min(
        Math.round((best / targetBpm) * 100),
        100
      )
    : null;

  const remaining = Math.max(
    targetBpm - best,
    0
  );

  return {
    latest,
    best,
    average,
    progress,
    remaining,
    totalMinutes,
    remainingMinutes,
    percentageComplete,
  };
}