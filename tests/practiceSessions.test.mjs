import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { saveCompletedPractice, savePracticeBpm } from '../src/services/practiceSessions.ts';
import { progressionDatabase, owner, exerciseId } from './helpers/progressionDatabase.mjs';

let db;
before(async()=>{db=await progressionDatabase();});
beforeEach(async()=>{await db.reset();});
after(async()=>{await db?.pg.close();});

test('real SDK and migration save the completion and remembered BPM atomically without changing goals',async()=>{
  const result=await saveCompletedPractice(db.client,owner,db.session(62));
  assert.equal(result.last_practice_bpm,62);assert.equal(result.starting_bpm,60);assert.equal(result.target_bpm,120);
  assert.equal(result.auto_progress_enabled,false);assert.equal(result.auto_progress_count,0);
});
test('lost response retries never duplicate a session or undo an earned increase',async()=>{
  await db.reset({auto_progress_enabled:true,auto_progress_count:3});
  const session=db.session();db.loseResponse();
  await assert.rejects(saveCompletedPractice(db.client,owner,session),/Saving completed practice/);
  assert.equal((await db.exercise()).last_practice_bpm,102);
  for(let i=0;i<3;i++)await saveCompletedPractice(db.client,owner,session);
  assert.equal((await db.exercise()).last_practice_bpm,102);assert.equal((await db.exercise()).auto_progress_count,0);
  assert.equal((await db.pg.query('select count(*)::int as n from drum_sessions')).rows[0].n,1);
});
test('offline completion remains retryable with its original ID',async()=>{
  const session=db.session();db.setOnline(false);
  await assert.rejects(saveCompletedPractice(db.client,owner,session),/Saving completed practice/);
  db.setOnline(true);await saveCompletedPractice(db.client,owner,session);
  assert.equal((await db.exercise()).last_practice_bpm,100);
});
test('a denied exercise UPDATE rolls back the session insert and progression',async()=>{
  await db.pg.exec(`reset role; drop policy exercise_owner on exercises;
    create policy exercise_read on exercises for select to authenticated using(true);
    create policy exercise_update on exercises for update to authenticated using(false);
    set role authenticated;`);
  const session=db.session();
  await assert.rejects(saveCompletedPractice(db.client,owner,session),/unavailable|update denied/);
  assert.equal((await db.pg.query('select count(*)::int as n from drum_sessions')).rows[0].n,0);
  await db.pg.exec(`reset role; drop policy exercise_read on exercises; drop policy exercise_update on exercises;
    create policy exercise_owner on exercises to authenticated using(user_id=current_setting('test.owner')::uuid)
      with check(user_id=current_setting('test.owner')::uuid);set role authenticated;`);
  await saveCompletedPractice(db.client,owner,session);assert.equal((await db.exercise()).last_practice_bpm,100);
});
test('RLS-filtered standalone BPM update is diagnosed and can be retried',async()=>{
  db.permitUpdates(false);
  await assert.rejects(savePracticeBpm(db.client,owner,exerciseId,65),/readable.*not updated.*UPDATE row-level security/);
  db.permitUpdates(true);await savePracticeBpm(db.client,owner,exerciseId,65);
  assert.equal((await db.exercise()).last_practice_bpm,65);
});
test('a filtered manual reset cannot be mistaken for success just because BPM already matches',async()=>{
  await db.reset({auto_progress_enabled:true,auto_progress_count:3});
  db.permitUpdates(false);
  await assert.rejects(savePracticeBpm(db.client,owner,exerciseId,100,true),/not updated/);
  assert.equal((await db.exercise()).auto_progress_count,3);
  db.permitUpdates(true);await savePracticeBpm(db.client,owner,exerciseId,100,true);
  assert.equal((await db.exercise()).auto_progress_count,0);
});
test('fractional and invalid minutes are rejected before database writes',async()=>{
  for(const minutes of [0.1,0.5,1.5,0,-1,NaN,Infinity]){
    let calls=0;
    await assert.rejects(saveCompletedPractice({from(){calls++;throw new Error('unexpected write');}},owner,{...db.session(),minutes}),/positive whole number/);
    assert.equal(calls,0);
  }
});
