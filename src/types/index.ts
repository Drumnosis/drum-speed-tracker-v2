export type Exercise = {
  id: string;
  name: string;
  target_bpm: number;
  lifetime_goal_minutes: number;
};

export type DrumSession = {
  id: string;
  exercise_id: string;
  bpm: number;
  minutes: number;
  created_at: string;
};

export type ExerciseStats = {
  latest: number | null;
  best: number | null;
  average: number | null;
  progress: number | null;
  remaining: number | null;

  totalMinutes: number;
  remainingMinutes: number;
  percentageComplete: number;
};

export type PracticeRoutine = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type PracticeRoutineItem = {
  id: string;
  routine_id: string;
  exercise_id: string;
  position: number;
  created_at: string;
};