import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advancePractice, changePracticeBpm, createPractice, nextExercise, parsePractice, togglePractice } from '../src/utils/practiceState.ts';

const routine = [
  { id: 'a', name: 'Singles', target_bpm: 150, bpm: 60, duration: 1, sessionId: 'first' },
  { id: 'b', name: 'Doubles', target_bpm: 160, bpm: 80, duration: 2, sessionId: 'second' },
];
const fresh = () => createPractice(routine.map(e => ({ ...e })));
const running = () => ({ ...fresh(), phase: 'running' });
const rest = () => advancePractice(running(), 60000, 100000);

test('four quarter-note beats precede practice without consuming exercise time', () => {
  let s = togglePractice(fresh());
  assert.equal(s.phase, 'countIn');
  s = advancePractice(s, 3999, 100000);
  assert.equal(s.phase, 'countIn');
  assert.equal(s.remainingMs, 60000);
  s = advancePractice(s, 1, 100001);
  assert.equal(s.phase, 'running');
  assert.equal(s.remainingMs, 60000);
});

test('BPM changes leave a running rest unchanged, and it continues from that time', () => {
  let s = advancePractice(rest(), 4200, 104200);
  s = changePracticeBpm(s, 62);
  assert.equal(s.restMs, 10800);
  assert.equal(s.phase, 'rest');
  assert.equal(s.remainingMs, 0);
  s = advancePractice(s, 1000, 105200);
  assert.equal(s.restMs, 9800);
});

test('paused rest preserves exact milliseconds across BPM changes and restore', () => {
  let s = togglePractice(advancePractice(rest(), 4567, 104567));
  assert.equal(s.phase, 'restPaused');
  const before = s.restMs;
  s = changePracticeBpm(s, 95);
  s = parsePractice(JSON.stringify(s));
  assert.ok(s);
  s = advancePractice(s, 120000, 224567);
  assert.equal(s.restMs, before);
  assert.equal(s.phase, 'restPaused');
  s = togglePractice(s);
  s = advancePractice(s, 1000, 225567);
  assert.equal(s.restMs, before - 1000);
});

test('each exercise is queued immediately at completion, before the rest', () => {
  const s = rest();
  assert.equal(s.phase, 'rest');
  assert.equal(s.restMs, 15000);
  assert.deepEqual(s.pending, [{ client_session_id: 'first', exercise_id: 'a', bpm: 60, minutes: 1, created_at: new Date(100000).toISOString() }]);
});

test('ticks, repeated completion and restored completion retain one stable save ID', () => {
  let s = rest();
  for (let i = 0; i < 10; i++) s = advancePractice(s, 100, 101000 + i * 100);
  s = parsePractice(JSON.stringify(s));
  assert.ok(s);
  s = advancePractice({ ...s, phase: 'running' }, 100, 102100);
  assert.equal(s.pending.length, 1);
  assert.equal(s.pending[0].client_session_id, 'first');
});

test('15 seconds rest advances once and starts the next four-beat count-in', () => {
  let s = advancePractice(rest(), 14999, 114999);
  assert.equal(s.index, 0);
  assert.equal(s.restMs, 1);
  s = advancePractice(s, 1, 115000);
  assert.equal(s.index, 1);
  assert.equal(s.phase, 'countIn');
  assert.equal(s.remainingMs, 120000);
  assert.equal(s.countMs, 0);
});

test('paused exercise is frozen and BPM edits never reset remaining time', () => {
  let s = advancePractice(running(), 12345, 112345);
  s = togglePractice(s);
  s = changePracticeBpm(s, 62);
  s = advancePractice(s, 60000, 172345);
  assert.equal(s.phase, 'paused');
  assert.equal(s.remainingMs, 47655);
  s = togglePractice(s);
  assert.equal(s.phase, 'countIn');
  assert.equal(s.remainingMs, 47655);
});

test('skip before start, during count-in and while running never records practice', () => {
  for (const phase of ['ready', 'countIn', 'running', 'paused']) {
    const s = nextExercise({ ...fresh(), phase }, false);
    assert.equal(s.index, 1);
    assert.equal(s.phase, 'ready');
    assert.equal(s.remainingMs, 120000);
    assert.equal(s.pending.length, 0);
  }
});

test('final completion saves once; final skip saves nothing', () => {
  let s = nextExercise(running(), false);
  const skipped = nextExercise(s, false);
  assert.equal(skipped.phase, 'complete');
  assert.equal(skipped.pending.length, 0);
  s = advancePractice({ ...s, phase: 'running' }, 120000, 220000);
  assert.equal(s.phase, 'complete');
  assert.equal(s.pending.length, 1);
  assert.deepEqual(advancePractice(s, 1000, 221000), s);
});

test('restoration retains routine position, BPM, timers, phase, subdivisions and pending saves', () => {
  for (const phase of ['ready', 'countIn', 'running', 'paused', 'rest', 'restPaused', 'complete']) {
    const s = { ...rest(), phase, remainingMs: 23456, restMs: 8765, subdivision: 4 };
    assert.deepEqual(parsePractice(JSON.stringify(s)), s);
  }
});

test('a delayed tick cannot silently complete the next exercise', () => {
  const s = advancePractice(running(), 3600000, 3600000);
  assert.equal(s.index, 0);
  assert.equal(s.phase, 'rest');
  assert.equal(s.pending.length, 1);
  assert.equal(s.restMs, 15000);
});

test('changing BPM keeps the target separate and does not mutate the source', () => {
  const original = fresh();
  const s = changePracticeBpm(original, 62);
  assert.equal(s.routine[0].target_bpm, 150);
  assert.equal(original.routine[0].bpm, 60);
  assert.equal(s.routine[0].bpm, 62);
  assert.equal(s.remainingMs, original.remainingMs);
});

test('rejects corrupt recovery data and unsupported versions', () => {
  for (const value of ['bad json', '{}', JSON.stringify({ ...fresh(), version: 2 }),
    JSON.stringify({ ...fresh(), index: 999 }), JSON.stringify({ ...fresh(), remainingMs: -1 })]) {
    assert.equal(parsePractice(value), null);
  }
});
