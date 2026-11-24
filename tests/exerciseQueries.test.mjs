import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatSupabaseError, loadExercises} from '../src/services/exerciseQueries.ts';

const missingProgression = {code: '42703', message: 'column exercises.auto_progress_enabled does not exist', details: ''};
const archived = {id: 'a', archived: true, name: 'Singles'};

function database(...responses) {
  const requests = [];
  return {
    requests,
    from(table) {
      return {select(columns) {
        return {eq(ownerColumn, owner) {
          return {async order(orderColumn, order) {
            requests.push({table, columns, ownerColumn, owner, orderColumn, order});
            return responses[requests.length - 1];
          }};
        }};
      }};
    },
  };
}

test('exercise loading retries without missing Auto Progression fields and keeps archived rows', async () => {
  const db = database(
    {error: missingProgression, status: 400, data: null},
    {error: null, status: 200, data: [archived]},
  );
  const result = await loadExercises(db, 'owner');
  assert.deepEqual(result.data, [archived]);
  assert.equal(result.progressionError, '[42703] column exercises.auto_progress_enabled does not exist');
  assert.equal(db.requests.length, 2);
  assert.match(db.requests[0].columns, /auto_progress_enabled/);
  assert.doesNotMatch(db.requests[1].columns, /auto_progress/);
  for (const {columns, ...request} of db.requests) {
    assert.match(columns, /archived/);
    assert.deepEqual(request, {table: 'exercises', ownerColumn: 'user_id', owner: 'owner',
      orderColumn: 'created_at', order: {ascending: true}});
  }
});

test('exercise loading keeps progression fields when available and surfaces unrelated errors', async () => {
  const progressed = {...archived, auto_progress_enabled: true, auto_progress_count: 2};
  const db = database({error: null, status: 200, data: [progressed]});
  assert.deepEqual((await loadExercises(db, 'owner')).data, [progressed]);
  assert.equal(db.requests.length, 1);

  for (const error of [
    {...missingProgression, message: 'column exercises.archived does not exist'},
    {code: '42501', message: 'permission denied', details: ''},
  ]) {
    const denied = database({error, status: 400, data: null});
    const result = await loadExercises(denied, 'owner');
    assert.equal(result.error, error);
    assert.equal(result.progressionError, null);
    assert.equal(denied.requests.length, 1);
  }
});

test('Supabase diagnostics give meaningful text with a database code or HTTP status', () => {
  assert.equal(formatSupabaseError(missingProgression, 400),
    '[42703] column exercises.auto_progress_enabled does not exist');
  assert.equal(formatSupabaseError({code: '', message: '', details: ''}, 503),
    '[HTTP 503] Supabase returned no error message.');
});
