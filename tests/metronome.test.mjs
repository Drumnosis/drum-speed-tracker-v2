import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metronomeIntervalMs, metronomeClick } from '../src/utils/metronome.ts';
import { SUBDIVISIONS, isSubdivision, advancePractice, changePracticeSubdivision, createPractice, parsePractice, togglePractice } from '../src/utils/practiceState.ts';

const values = [1, 2, 3, 4, 5, 7, 8];
const routine = [
  { id: 'a', name: 'Singles', target_bpm: 150, bpm: 60, duration: 1, sessionId: 'first' },
  { id: 'b', name: 'Doubles', target_bpm: 160, bpm: 80, duration: 2, sessionId: 'second' },
];

test('selector retains existing options and adds only the requested subdivisions', () => {
  assert.deepEqual(SUBDIVISIONS.map(option => option.value), values);
  assert.deepEqual(SUBDIVISIONS.map(option => option.label), [
    'Quarter notes', 'Eighth notes', 'Eighth-note triplets', 'Sixteenth notes',
    'Quintuplets', 'Septuplets', '32nd notes',
  ]);
});

for (const notes of values) {
  test(`${notes} evenly spaced clicks per beat, with unchanged BPM and beat accents`, () => {
    for (const bpm of [30, 60, 123, 300]) {
      const beatMs = 60000 / bpm;
      const interval = metronomeIntervalMs(bpm, notes);
      const clicks = Array.from({ length: notes * 8 + 1 }, (_, tick) => ({
        at: tick * interval, ...metronomeClick(tick, notes),
      }));
      for (let beat = 0; beat < 8; beat++) {
        const group = clicks.slice(beat * notes, (beat + 1) * notes);
        assert.equal(group.length, notes);
        assert.ok(Math.abs(group[0].at - beat * beatMs) < 1e-8);
        assert.equal(group[0].frequency, beat % 4 === 0 ? 1600 : 1000);
        assert.equal(group[0].volume, beat % 4 === 0 ? 0.25 : 0.15);
        for (let note = 0; note < notes; note++) {
          const tick = beat * notes + note;
          assert.ok(Math.abs(clicks[tick + 1].at - clicks[tick].at - beatMs / notes) < 1e-8);
          if (note > 0) {
            assert.equal(group[note].frequency, 700);
            assert.equal(group[note].volume, 0.07);
            assert.ok(group[note].volume < group[0].volume);
          }
        }
      }
      assert.ok(Math.abs(clicks.at(-1).at - 8 * beatMs) < 1e-8);
    }
  });

  test(`${notes} subdivision preserves four quarter-note count-in beats`, () => {
    assert.equal(metronomeIntervalMs(60, notes, true), 1000);
    assert.deepEqual(Array.from({ length: 4 }, (_, tick) => metronomeClick(tick, notes, true)), [
      { frequency: 1600, volume: 0.25 },
      ...Array.from({ length: 3 }, () => ({ frequency: 1000, volume: 0.15 })),
    ]);
    let state = changePracticeSubdivision(togglePractice(createPractice(routine)), notes);
    state = advancePractice(state, 3999, 100000);
    assert.equal(state.phase, 'countIn');
    state = advancePractice(state, 1, 100001);
    assert.equal(state.phase, 'running');
    assert.equal(state.remainingMs, 60000);
    assert.equal(state.subdivision, notes);
  });
}

test('switching any subdivision preserves every other field and recovery across practice phases', () => {
  const completed = advancePractice({ ...createPractice(routine), phase: 'running' }, 60000, 100000);
  for (const phase of ['ready', 'countIn', 'running', 'paused', 'rest', 'restPaused', 'complete']) {
    let state = { ...completed, index: 1, phase, remainingMs: 23456, restMs: 8765, countMs: 321 };
    for (const subdivision of values) {
      const before = structuredClone(state);
      const changed = changePracticeSubdivision(state, subdivision);
      assert.deepEqual(changed, { ...before, subdivision });
      assert.deepEqual(state, before, 'the prior snapshot is not mutated');
      assert.strictEqual(changed.routine, state.routine);
      assert.strictEqual(changed.pending, state.pending);
      assert.deepEqual(parsePractice(JSON.stringify(changed)), changed);
      state = changed;
    }
  }
});

test('new subdivisions do not change elapsed practice or rest time or pause/resume', () => {
  for (const subdivision of values) {
    let state = changePracticeSubdivision({ ...createPractice(routine), phase: 'running' }, subdivision);
    state = advancePractice(state, 12345, 100000);
    assert.equal(state.remainingMs, 47655);
    state = togglePractice(state);
    assert.equal(advancePractice(state, 5000, 105000).remainingMs, 47655);
    state = togglePractice(state);
    assert.equal(state.phase, 'countIn');
    assert.equal(state.subdivision, subdivision);
    state = advancePractice({ ...state, phase: 'running' }, 47655, 150000);
    state = advancePractice(state, 1234, 151234);
    assert.equal(state.restMs, 13766);
    state = togglePractice(state);
    assert.equal(advancePractice(state, 5000, 156234).restMs, 13766);
    state = togglePractice(state);
    assert.equal(advancePractice(state, 1000, 157234).restMs, 12766);
  }
});

test('unsupported subdivisions remain rejected without corrupting recovery', () => {
  const state = createPractice(routine);
  for (const subdivision of [0, 6, 9, -1, 1.5, NaN, Infinity, '5', null]) {
    assert.equal(isSubdivision(subdivision), false);
    assert.strictEqual(changePracticeSubdivision(state, subdivision), state);
    assert.equal(parsePractice(JSON.stringify({ ...state, subdivision })), null);
  }
});
