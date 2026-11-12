import type { PracticeState } from './practiceState';

export function needsPracticeRecovery(state: PracticeState | null): boolean {
  return !!state && (state.phase !== 'complete' || state.pending.length > 0);
}

// Completed sessions remain durable until both the session and BPM writes have
// succeeded. Cleanup and pagehide use this same rule, so they cannot resurrect
// an already-saved completion.
export function persistPractice(
  storage: Pick<Storage, 'setItem' | 'removeItem'>, userId: string,
  state: PracticeState, pendingBpms: Record<string, number>,
) {
  const practiceKey = `drum-practice:v1:${userId}`;
  const bpmKey = `drum-bpm-pending:${userId}`;
  const hasBpms = Object.keys(pendingBpms).length > 0;
  if (needsPracticeRecovery(state) || hasBpms) storage.setItem(practiceKey, JSON.stringify(state));
  else storage.removeItem(practiceKey);
  if (hasBpms) storage.setItem(bpmKey, JSON.stringify(pendingBpms));
  else storage.removeItem(bpmKey);
  return needsPracticeRecovery(state) || hasBpms;
}
