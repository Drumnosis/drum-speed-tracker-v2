import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuickPractice, createPractice, changePracticeBpm, changePracticeDuration, changePracticeSubdivision, advancePractice, togglePractice, parsePractice } from '../src/utils/practiceState.ts';
import { persistPractice, needsPracticeRecovery } from '../src/utils/practiceRecovery.ts';
import { practiceIdentity } from '../src/services/practiceIdentity.ts';
import { saveCompletedPractice } from '../src/services/practiceSessions.ts';
import { calculateExerciseStats } from '../src/utils/exerciseStats.ts';
const exercise = {id:'a', name:'Singles', target_bpm:150, starting_bpm:60};
const key = 'drum-practice:v1:user';
const bpmKey = 'drum-bpm-pending:user';
function storage() {
  const values = new Map();
  return {getItem:k => values.get(k) ?? null, setItem:(k,v) => values.set(k,v), removeItem:k => values.delete(k)};
}
function runningQuick() {
  let s = changePracticeSubdivision(changePracticeDuration(changePracticeBpm(createQuickPractice(exercise, 'stable-id'), 80), 1), 7);
  s = advancePractice(togglePractice(s), 3000, 3000);
  return advancePractice(s, 1234, 4234);
}
for (const navigation of ['navigate away and Continue', 'reload and Continue']) {
  test(`${navigation} restores Quick Practice identity and exact exercise settings`, () => {
    const disk = storage();
    const original = runningQuick();
    assert.equal(persistPractice(disk, 'user', original, {}), true);
    const restored = parsePractice(disk.getItem(key));
    assert.equal(restored.quickPractice, true);
    assert.deepEqual(restored, original);
    assert.equal(restored.routine[0].bpm, 80);
    assert.equal(restored.routine[0].duration, 1);
    assert.equal(restored.remainingMs, 58766);
    assert.equal(restored.subdivision, 7);
    assert.equal(restored.routine[0].sessionId, 'stable-id');
  });
}
test('routine recovery remains a routine and keeps index, rest phase, settings and pending sessions', () => {
  const disk = storage();
  const quick = runningQuick();
  const routine = createPractice([...quick.routine, {...quick.routine[0], id:'b', sessionId:'second'}]);
  const resting = advancePractice({...routine,phase:'running'}, 60000, 60000);
  persistPractice(disk, 'user', resting, {});
  const restored = parsePractice(disk.getItem(key));
  assert.equal(restored.quickPractice, undefined);
  assert.equal(restored.phase, 'rest');
  assert.deepEqual(restored, resting);
});
test('successful completion clears recovery; cleanup/pagehide cannot resurrect it', async () => {
  const disk = storage();
  let s = advancePractice(runningQuick(), 60000, 70000);
  assert.equal(s.phase, 'complete');
  const bpms = {a:80};
  assert.equal(persistPractice(disk,'user',s,bpms), true);
  const rows = new Map(); let lastBpm; let attempts = 0;
  const db = {from(table) {
    if (table === 'drum_sessions') return {async upsert(row) {
      if (!rows.has(row.client_session_id)) rows.set(row.client_session_id,row);
      if (++attempts === 1) return {error:{message:'response lost',code:'network'}};
      return {error:null};
    }};
    assert.equal(table, 'exercises');
    return {update(value) {lastBpm=value.last_practice_bpm;const q={eq(){return q;},async select(){return {data:[{id:'a',last_practice_bpm:lastBpm}],error:null};}};return q;}};
  }};
  await assert.rejects(saveCompletedPractice(db,'user',s.pending[0]), /response lost/);
  assert.ok(parsePractice(disk.getItem(key)).pending.length);
  s = parsePractice(disk.getItem(key)); // reconnect/reload uses original ID
  await saveCompletedPractice(db,'user',s.pending[0]);
  delete bpms.a;
  s = {...s,pending:[]};
  assert.equal(persistPractice(disk,'user',s,bpms), false);
  assert.equal(needsPracticeRecovery(s),false);
  assert.equal(disk.getItem(key),null);
  assert.equal(disk.getItem(bpmKey),null);
  // Unmount/pagehide calls store again with in-memory completion.
  assert.equal(persistPractice(disk,'user',s,bpms),false);
  assert.equal(disk.getItem(key),null);
  assert.equal(rows.size,1);
  assert.equal(lastBpm,80);
  assert.equal(calculateExerciseStats([...rows.values()],150,10).totalMinutes,1);
});
test('completed recovery is retained until pending BPM writes also succeed', () => {
  const disk=storage(); const completed={...runningQuick(),phase:'complete',pending:[]};
  assert.equal(persistPractice(disk,'user',completed,{a:80}),true);
  assert.ok(disk.getItem(key));
  assert.equal(persistPractice(disk,'user',completed,{}),false);
  assert.equal(disk.getItem(key),null);
});
test('browser identity uses existing session without a user-profile network request or sign-out', async () => {
  let profiles=0; let signouts=0;
  const auth={getSession:async()=>({data:{session:{user:{id:'user'}}},error:null}),getUser:()=>{profiles++;},signOut:()=>{signouts++;}};
  assert.equal((await practiceIdentity(auth)).id,'user');
  assert.equal(profiles,0); assert.equal(signouts,0);
});
for (const failure of ['throw','error']) {
  test(`auth ${failure} preserves saved practice and retry restores the same session`, async () => {
    const disk=storage();const s=runningQuick();persistPractice(disk,'user',s,{});
    const before=disk.getItem(key);let offline=true;
    const auth={async getSession(){if(offline){if(failure==='throw')throw new TypeError('Failed to fetch');return {data:{session:null},error:{message:'Failed to fetch'}};}return {data:{session:{user:{id:'user'}}},error:null};}};
    await assert.rejects(practiceIdentity(auth));
    assert.equal(disk.getItem(key),before);
    offline=false;
    assert.equal((await practiceIdentity(auth)).id,'user');
    assert.deepEqual(parsePractice(disk.getItem(key)),s);
  });
}
