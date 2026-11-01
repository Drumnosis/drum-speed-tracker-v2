import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveCompletedPractice, savePracticeBpm } from '../src/services/practiceSessions.ts';

function database() {
  const exercise = { id: 'exercise-a', starting_bpm: 60, target_bpm: 80, last_practice_bpm: null };
  const sessions = new Map();
  const calls = [];
  let failBpm = false;
  const client = {
    from(table) {
      if (table === 'drum_sessions') return {
        async upsert(row, options) {
          calls.push('session');
          assert.equal(options.ignoreDuplicates, true);
          assert.equal(options.onConflict, 'user_id,client_session_id');
          if (!sessions.has(row.client_session_id)) sessions.set(row.client_session_id, row);
          return { error: null };
        },
      };
      assert.equal(table, 'exercises');
      return {
        update(values) {
          const filters = {};
          const query = {
            eq(key, value) { filters[key] = value; return query; },
            async select() {
              calls.push('bpm');
              assert.deepEqual(filters, { id: 'exercise-a', user_id: 'user-a' });
              if (failBpm) return { data: null, error: { message: 'BPM update denied' } };
              Object.assign(exercise, values);
              return { data: [{ ...exercise }], error: null };
            },
          };
          return query;
        },
      };
    },
  };
  return { client, exercise, sessions, calls, denyBpm(value) { failBpm = value; } };
}
const session = { client_session_id: 'completion-a', exercise_id: 'exercise-a', bpm: 62, minutes: 1, created_at: '2026-11-01T12:00:00Z' };

test('completion saves 62 before refreshing exercises; starting 60 and target 80 remain unchanged', async () => {
  const db = database();
  await saveCompletedPractice(db.client, 'user-a', session);
  // This is the refresh performed by onSessionSaved after the player dequeues.
  const refreshed = { ...db.exercise };
  const nextBpm = refreshed.last_practice_bpm ?? refreshed.starting_bpm;
  assert.equal(nextBpm, 62);
  assert.equal(refreshed.starting_bpm, 60);
  assert.equal(refreshed.target_bpm, 80);
  assert.deepEqual(db.calls, ['session', 'bpm']);
  assert.equal(db.sessions.size, 1);
});

test('failed BPM write does not report successful completion; retry saves BPM without duplicating session', async () => {
  const db = database();
  db.denyBpm(true);
  await assert.rejects(saveCompletedPractice(db.client, 'user-a', session), /BPM update denied/);
  assert.equal(db.exercise.last_practice_bpm, null);
  db.denyBpm(false);
  await saveCompletedPractice(db.client, 'user-a', session);
  assert.equal(db.exercise.last_practice_bpm, 62);
  assert.equal(db.sessions.size, 1);
});

import { createClient } from '@supabase/supabase-js';

// Real Supabase query builders with a fake HTTP transport. This catches
// Accept/Prefer/response-shape bugs that a hand-written fluent mock misses.
function httpDatabase() {
  const exercise = { id: 'exercise-a', starting_bpm: 60, target_bpm: 80, last_practice_bpm: null };
  const sessions = new Map();
  const requests = [];
  let allowUpdate = true;
  let online = true;
  let loseSessionResponse = false;
  const client = createClient('https://practice-test.example', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      if (!online) throw new TypeError('Failed to fetch');
      const path = new URL(url);
      const headers = new Headers(options.headers);
      requests.push({ path, method: options.method, headers });
      assert.ok(!headers.get('accept')?.includes('vnd.pgrst.object'), 'save flow must not demand a singular response');
      if (path.pathname.endsWith('/drum_sessions')) {
        assert.equal(options.method, 'POST');
        assert.equal(path.searchParams.get('on_conflict'), 'user_id,client_session_id');
        assert.ok(headers.get('prefer').includes('resolution=ignore-duplicates'));
        const row = JSON.parse(options.body);
        if (!sessions.has(row.client_session_id)) sessions.set(row.client_session_id, row);
        if (loseSessionResponse) { loseSessionResponse = false; throw new TypeError('Response lost after commit'); }
        return new Response(null, { status: 201 });
      }
      assert.ok(path.pathname.endsWith('/exercises'));
      assert.equal(path.searchParams.get('id'), 'eq.exercise-a');
      assert.equal(path.searchParams.get('user_id'), 'eq.user-a');
      if (options.method === 'PATCH') {
        const values = JSON.parse(options.body);
        assert.deepEqual(Object.keys(values), ['last_practice_bpm']);
        if (allowUpdate) Object.assign(exercise, values);
        return Response.json(allowUpdate ? [{ ...exercise }] : []);
      }
      assert.equal(options.method, 'GET');
      return Response.json([{ ...exercise }]);
    } },
  });
  return { client, exercise, sessions, requests,
    permitUpdates(value) { allowUpdate = value; }, setOnline(value) { online = value; },
    loseResponse() { loseSessionResponse = true; } };
}

test('real SDK saves a completion, remembers 62 and accepts an array response', async () => {
  const db = httpDatabase();
  await saveCompletedPractice(db.client, 'user-a', session);
  assert.equal(db.sessions.size, 1);
  assert.equal(db.exercise.last_practice_bpm, 62);
  assert.equal(db.exercise.starting_bpm, 60);
  assert.equal(db.exercise.target_bpm, 80);
});

test('RLS-filtered zero-row UPDATE is diagnosed, remains retryable, and never duplicates the already-saved session', async () => {
  const db = httpDatabase();
  db.permitUpdates(false);
  for (let i = 0; i < 2; i++) {
    await assert.rejects(saveCompletedPractice(db.client, 'user-a', session), /readable.*not updated.*UPDATE row-level security/);
  }
  assert.equal(db.exercise.last_practice_bpm, null);
  assert.equal(db.sessions.size, 1);
  db.permitUpdates(true);
  await saveCompletedPractice(db.client, 'user-a', session);
  await saveCompletedPractice(db.client, 'user-a', session);
  assert.equal(db.exercise.last_practice_bpm, 62);
  assert.equal(db.sessions.size, 1);
  assert.equal(db.exercise.starting_bpm, 60);
  assert.equal(db.exercise.target_bpm, 80);
});

test('offline completion retries successfully with its original ID', async () => {
  const db = httpDatabase();
  db.setOnline(false);
  await assert.rejects(saveCompletedPractice(db.client, 'user-a', session), /Saving completed practice session/);
  assert.equal(db.sessions.size, 0);
  db.setOnline(true);
  await saveCompletedPractice(db.client, 'user-a', session);
  assert.equal(db.sessions.size, 1);
  assert.equal(db.exercise.last_practice_bpm, 62);
});

test('lost insert response after commit retries without recording the session twice', async () => {
  const db = httpDatabase();
  db.loseResponse();
  await assert.rejects(saveCompletedPractice(db.client, 'user-a', session), /Saving completed practice session/);
  assert.equal(db.sessions.size, 1);
  await saveCompletedPractice(db.client, 'user-a', session);
  assert.equal(db.sessions.size, 1);
  assert.equal(db.exercise.last_practice_bpm, 62);
});

test('standalone remembered BPM update verifies the saved value without touching either goal', async () => {
  const db = httpDatabase();
  await savePracticeBpm(db.client, 'user-a', 'exercise-a', 65);
  assert.equal(db.exercise.last_practice_bpm, 65);
  assert.equal(db.exercise.starting_bpm, 60);
  assert.equal(db.exercise.target_bpm, 80);
  assert.equal(db.sessions.size, 0);
});
