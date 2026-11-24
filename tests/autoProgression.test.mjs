import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { progressionDatabase, owner, exerciseId } from './helpers/progressionDatabase.mjs';
import { saveCompletedPractice, savePracticeBpm } from '../src/services/practiceSessions.ts';
import { createPractice, createQuickPractice, advancePractice, nextExercise, changePracticeBpm } from '../src/utils/practiceState.ts';

let db;
before(async()=>{db=await progressionDatabase();});
beforeEach(async()=>{await db.reset({auto_progress_enabled:true});});
after(async()=>{await db?.pg.close();});
const complete=async(bpm=100)=>saveCompletedPractice(db.client,owner,db.session(bpm));

for(const after of [4,8,12])for(const by of [1,2,5])test(`${after} completed sessions earn +${by} BPM only after completion`,async()=>{
  await db.reset({auto_progress_enabled:true,auto_progress_after:after,auto_progress_by:by});
  for(let i=1;i<after;i++){
    await complete();const exercise=await db.exercise();
    assert.equal(exercise.last_practice_bpm,100);assert.equal(exercise.auto_progress_count,i);
  }
  await complete();const exercise=await db.exercise();
  assert.equal(exercise.last_practice_bpm,100+by);assert.equal(exercise.auto_progress_count,0);
  assert.equal(exercise.starting_bpm,60);assert.equal(exercise.target_bpm,120);
  await complete(100+by);assert.equal((await db.exercise()).auto_progress_count,1);
});

test('increase caps exactly at Target BPM, then stops counting or increasing',async()=>{
  await db.reset({auto_progress_enabled:true,auto_progress_by:5,last_practice_bpm:118});
  for(let i=0;i<4;i++)await complete(118);
  assert.equal((await db.exercise()).last_practice_bpm,120);
  for(let i=0;i<12;i++)await complete(120);
  assert.equal((await db.exercise()).last_practice_bpm,120);assert.equal((await db.exercise()).auto_progress_count,0);
});

test('manual Practice BPM change resets count, preserves goals and restarts at the new tempo',async()=>{
  for(let i=0;i<3;i++)await complete();
  await savePracticeBpm(db.client,owner,exerciseId,105);
  assert.equal((await db.exercise()).auto_progress_count,0);
  await complete(105);assert.equal((await db.exercise()).auto_progress_count,1);
  assert.equal((await db.exercise()).starting_bpm,60);assert.equal((await db.exercise()).target_bpm,120);
  // Idempotent remembered BPM saves on Start/Resume must not reset progress.
  await savePracticeBpm(db.client,owner,exerciseId,105);
  assert.equal((await db.exercise()).auto_progress_count,1);
});

test('off prevents counting, on restarts at current BPM, changed settings restart counting',async()=>{
  await complete();await complete();
  await db.pg.exec('update exercises set auto_progress_enabled=false');
  assert.equal((await db.exercise()).auto_progress_count,0);
  for(let i=0;i<8;i++)await complete();
  assert.equal((await db.exercise()).last_practice_bpm,100);assert.equal((await db.exercise()).auto_progress_count,0);
  await db.pg.exec('update exercises set auto_progress_enabled=true');
  await complete();assert.equal((await db.exercise()).auto_progress_count,1);
  await db.pg.exec('update exercises set auto_progress_after=8,auto_progress_by=5');
  assert.equal((await db.exercise()).auto_progress_count,0);
});

test('manual edits returning to the original BPM reset progress, including offline completion and retry',async()=>{
  await db.reset({auto_progress_enabled:true,auto_progress_count:3});
  // Explicit reset survives coalescing 100 -> 105 -> 100 before a save.
  await savePracticeBpm(db.client,owner,exerciseId,100,true);
  assert.equal((await db.exercise()).auto_progress_count,0);
  await db.reset({auto_progress_enabled:true,auto_progress_count:3});
  const original={...createQuickPractice(await db.exercise(),db.session().client_session_id),phase:'running',bpmResets:{[exerciseId]:100}};
  const finished=advancePractice(original,60000,Date.now());
  assert.equal(finished.pending[0].reset_progress,true);
  assert.deepEqual(finished.bpmResets,{});
  assert.equal(original.bpmResets[exerciseId],100,'prior recovery snapshot is immutable');
  await saveCompletedPractice(db.client,owner,finished.pending[0]);
  await saveCompletedPractice(db.client,owner,finished.pending[0]);
  assert.equal((await db.exercise()).auto_progress_count,1);assert.equal((await db.exercise()).last_practice_bpm,100);
});

test('Quick Practice and different routines share one progression counter and next starting BPM',async()=>{
  const exercise=await db.exercise();
  for(let i=0;i<4;i++){
    const sessionId=db.session().client_session_id;
    let state=i%2===0 ? createQuickPractice(exercise,sessionId) : createPractice([{...exercise,bpm:100,duration:1,sessionId}]);
    state=advancePractice({...state,phase:'running'},60000,Date.now());
    await saveCompletedPractice(db.client,owner,state.pending[0]);
  }
  const next=await db.exercise();assert.equal(next.last_practice_bpm,102);
  assert.equal(createQuickPractice(next,db.session().client_session_id).routine[0].bpm,102);
});

test('skipped, cancelled, incomplete and abandoned exercises never enqueue or count',async()=>{
  const exercise=await db.exercise(),routine=[{...exercise,bpm:100,duration:1,sessionId:db.session().client_session_id}];
  for(const phase of ['ready','countIn','running','paused']){
    let state={...createPractice(routine),phase};
    assert.deepEqual(nextExercise(state,false).pending,[]);
    state=advancePractice({...state,phase:'running'},59000,Date.now());
    assert.deepEqual(state.pending,[]);
    assert.deepEqual({...state,phase:'complete'}.pending,[]);
  }
  assert.equal((await db.exercise()).auto_progress_count,0);
});

test('changing BPM during an exercise resets progress without resetting its timer',async()=>{
  for(let i=0;i<3;i++)await complete();
  const exercise=await db.exercise();
  let state={...createQuickPractice(exercise,db.session().client_session_id),phase:'running',remainingMs:45000};
  state=changePracticeBpm(state,95);await savePracticeBpm(db.client,owner,exerciseId,95);
  assert.equal(state.remainingMs,45000);assert.equal((await db.exercise()).auto_progress_count,0);
  state=advancePractice(state,45000,Date.now());await saveCompletedPractice(db.client,owner,state.pending[0]);
  assert.equal((await db.exercise()).auto_progress_count,1);assert.equal((await db.exercise()).last_practice_bpm,95);
});

test('manual history inserts do not count or alter remembered BPM',async()=>{
  const session=db.session(80);
  await db.pg.query('insert into drum_sessions(user_id,exercise_id,bpm,minutes,client_session_id) values($1,$2,$3,$4,$5)',[owner,exerciseId,80,1,session.client_session_id]);
  assert.equal((await db.exercise()).auto_progress_count,0);assert.equal((await db.exercise()).last_practice_bpm,100);
});

test('RLS prevents another account modifying settings or progressing this exercise',async()=>{
  await db.pg.exec("set test.owner='33333333-3333-4333-8333-333333333333'");
  try {
    const changed=await db.pg.query('update exercises set auto_progress_enabled=false where id=$1 returning id',[exerciseId]);
    assert.equal(changed.rows.length,0);
    await assert.rejects(complete(),/row-level security/);
  }finally{await db.pg.exec(`set test.owner='${owner}'`);}
  assert.equal((await db.exercise()).auto_progress_count,0);
});

test('invalid progression choices are rejected by database constraints',async()=>{
  for(const sql of ['auto_progress_after=5','auto_progress_by=3','auto_progress_count=-1'])await assert.rejects(db.pg.exec(`update exercises set ${sql}`),/check constraint/);
});
