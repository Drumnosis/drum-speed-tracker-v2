import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuickPractice, changePracticeBpm, changePracticeDuration, changePracticeSubdivision, togglePractice, advancePractice, parsePractice } from '../src/utils/practiceState.ts';
import { saveCompletedPractice } from '../src/services/practiceSessions.ts';
import { calculateExerciseStats } from '../src/utils/exerciseStats.ts';
const exercise = { id: 'a', name: 'Singles', starting_bpm: 60, target_bpm: 150, last_practice_bpm: 72 };
test('single exercise launches without a routine and uses remembered BPM then starting BPM', () => {
  const s = createQuickPractice(exercise, 'session');
  assert.equal(s.quickPractice, true);
  assert.equal(s.routine.length, 1);
  assert.equal(s.routine[0].bpm, 72);
  assert.equal(createQuickPractice({...exercise, last_practice_bpm: null}, 's').routine[0].bpm, 60);
  assert.equal(createQuickPractice(exercise, 's', 75).routine[0].bpm, 75);
});
test('BPM, duration and subdivision edits feed the existing count-in and timer without changing the exercise', () => {
  let s = changePracticeSubdivision(changePracticeDuration(changePracticeBpm(createQuickPractice(exercise, 's'), 80), 1), 7);
  assert.equal(s.remainingMs, 60000);
  assert.equal(s.subdivision, 7);
  s = advancePractice(togglePractice(s), 3000, 3000);
  assert.equal(s.phase, 'running');
  assert.equal(s.remainingMs, 60000);
  assert.equal(s.routine[0].bpm, 80);
  assert.equal(exercise.last_practice_bpm, 72);
  assert.equal(s.routine[0].target_bpm, 150);
  assert.equal(changePracticeDuration(s, 5), s);
});
test('navigation recovery preserves single exercise, remaining time and subdivision; pause time is excluded', () => {
  let s = changePracticeSubdivision(createQuickPractice(exercise, 's'), 3);
  s = advancePractice(togglePractice(s), 4000, 4000);
  s = advancePractice(s, 1234, 5234);
  s = parsePractice(JSON.stringify(s));
  assert.equal(s.quickPractice, true);
  assert.equal(s.remainingMs, 58766);
  assert.equal(s.subdivision, 3);
  s = togglePractice(s);
  assert.equal(advancePractice(s, 60000, 65234).remainingMs, 58766);
});
test('completion queues immediately once, has no next exercise/rest, saves one session and updates Statistics without routine writes', async () => {
  let s = createQuickPractice(exercise, 'stable-id');
  s = advancePractice(togglePractice(s), 4000, 4000);
  s = advancePractice(s, 60000, 64000);
  assert.equal(s.phase, 'complete');
  s = advancePractice(parsePractice(JSON.stringify(s)), 60000, 124000);
  assert.equal(s.pending.length, 1);
  const sessions = new Map(); const writes = []; let remembered;
  const db = { from(table) {
    writes.push(table);
    if (table === 'drum_sessions') return { async upsert(row) { sessions.set(row.client_session_id, row); remembered={last_practice_bpm:row.bpm};return {error:null}; } };
    assert.equal(table, 'exercises', 'Quick Practice must never access saved routine tables');
    return { select() { const q = {eq() {return q;}, then(resolve) {resolve({data:[{id:'a', ...remembered}],error:null});}}; return q; } };
  } };
  await saveCompletedPractice(db, 'user', s.pending[0]);
  await saveCompletedPractice(db, 'user', s.pending[0]); // lost response/recovery retry
  assert.equal(sessions.size, 1);
  assert.deepEqual(remembered, {last_practice_bpm:72});
  assert.equal(calculateExerciseStats([...sessions.values()], 150, 10).totalMinutes, 1);
  assert.ok(writes.every(t => ['exercises','drum_sessions'].includes(t)));
});
test('Quick Practice accepts only whole-minute durations without rounding invalid entries', () => {
  const s = createQuickPractice(exercise, 'whole-minutes');
  for (const value of [0.1, 0.5, 1.5, 0, -1, 181, NaN, Infinity]) assert.equal(changePracticeDuration(s, value), s);
  assert.equal(changePracticeDuration(s, 2).remainingMs, 120000);
});
