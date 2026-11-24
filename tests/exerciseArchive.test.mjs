import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {calculateExerciseStats} from '../src/utils/exerciseStats.ts';
import {practiceIdentity} from '../src/services/practiceIdentity.ts';
import {progressionDatabase, exerciseId, owner} from './helpers/progressionDatabase.mjs';

function renderComponent(name, props, modules = {}, states = []) {
  const source = fs.readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  });
  const exports = {};
  const jsx = (type, props) => ({type, props});
  let slot = 0;
  vm.runInNewContext(outputText, {exports, alert: message => assert.fail(message), require(path) {
    if (path === 'react') return {
      useState: initial => [states[slot++] ?? initial, () => {}],
      useEffect() {},
      useRef: current => ({current}),
    };
    if (path === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    return modules[path] ?? {default: path.split('/').at(-1)};
  }});
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node?.props) return;
    nodes.push(node);
    visit(node.props.children);
  }
  visit(exports.default(props));
  return nodes;
}

test('archive and restore only change visibility while keeping history, Statistics and saved routine items', {timeout: 30000}, async () => {
  const db = await progressionDatabase();
  const {pg} = db;
  try {
    await pg.exec(`
      alter table exercises add column groove_scribe_url text;
      alter table exercises add column lifetime_goal_minutes integer default 60;
    `);
    await db.reset({auto_progress_enabled: true, auto_progress_count: 2, groove_scribe_url: 'https://example.com/groove'});
    await db.client.from('drum_sessions').upsert({...db.session(), user_id: owner});
    await pg.exec(`
      reset role;
      create table practice_routine_items (exercise_id uuid references exercises(id), routine_id text);
      insert into practice_routine_items values ('${exerciseId}', 'saved-routine');
    `);
    const migration = fs.readFileSync(new URL('../supabase/migrations/202611240001_exercise_archive.sql', import.meta.url), 'utf8');
    await pg.exec(migration);
    const original = await db.exercise();
    const history = (await pg.query('select * from drum_sessions')).rows;
    const items = (await pg.query('select * from practice_routine_items')).rows;
    assert.equal(original.archived, false);
    assert.equal(history.length, 1);
    assert.equal(items.length, 1);

    let refreshes = 0;
    let completeRefresh;
    const listModules = {
      '@/services/practiceIdentity': {practiceIdentity},
      '@/utils/exerciseStats': {calculateExerciseStats},
      '@/services/supabase': {supabase: {
        auth: {async getSession() { return {data: {session: {user: {id: owner}}}, error: null}; }},
        from(table) {
          assert.equal(table, 'exercises');
          return db.client.from(table);
        },
      }},
    };
    function renderList(exercise, readOnly = false) {
      return renderComponent('ExerciseList', {
        exercises: [exercise], sessions: history, readOnly,
        async onExercisesChanged() { refreshes++; completeRefresh(); },
      }, listModules);
    }
    function click(exercise, label) {
      const button = renderList(exercise).find(node => node.type === 'button' && node.props.children === label);
      assert.ok(button);
      const refreshed = new Promise(resolve => { completeRefresh = resolve; });
      button.props.onClick();
      return refreshed;
    }
    const visibleExercises = (exercise, archived) => renderComponent('AppShell', {}, {}, [
      'exercises', 'builder', false, null, null, archived, [exercise], history,
    ]).find(node => node.type === 'ExerciseList').props.exercises;
    function builder(exercises, routineItems) {
      return renderComponent('RoutineBuilder', {exercises}, {}, [
        [], {id: 'saved-routine', name: 'My routine', items: routineItems}, false, false, true,
      ]);
    }
    const statsProps = exercise => renderList(exercise, true).find(node => node.type === 'ExerciseStats').props;

    await pg.exec('set role authenticated;');
    await click(original, 'Archive');
    const archived = await db.exercise();
    assert.deepEqual(archived, {...original, archived: true});
    assert.equal(visibleExercises(archived, false).length, 0);
    assert.equal(visibleExercises(archived, true)[0].id, exerciseId);
    assert.equal(statsProps(archived).totalMinutes, 1);
    assert.deepEqual({...statsProps(archived)}, {...statsProps(original)});
    assert.equal(builder([archived], []).find(node => node.type === 'RoutineAddExercise').props.exercises.length, 0);
    const routineNodes = builder([archived], [{exercise_id: exerciseId, bpm: 90, duration: 2}]);
    assert.ok(routineNodes.some(node => node.type === 'RoutineExerciseCard'));

    // Verify that the existing exercise owner policy still gates updates.
    await pg.exec("set test.owner='33333333-3333-4333-8333-333333333333';");
    const denied = await pg.query('update exercises set archived=false returning id');
    assert.equal(denied.rows.length, 0);
    await pg.query("select set_config('test.owner', $1, false)", [owner]);
    await click(archived, 'Restore');
    const restored = await db.exercise();
    assert.deepEqual(restored, original);
    assert.equal(visibleExercises(restored, false)[0].id, exerciseId);
    assert.equal(builder([restored], []).find(node => node.type === 'RoutineAddExercise').props.exercises[0].id, exerciseId);
    assert.equal(refreshes, 2);

    await pg.exec('reset role;');
    assert.deepEqual((await pg.query('select * from drum_sessions')).rows, history);
    assert.deepEqual((await pg.query('select * from practice_routine_items')).rows, items);
  } finally {
    await pg.close();
  }
});

test('Remove Exercise waits for explicit confirmation and Cancel leaves exercise data alone', async () => {
  const exercise = {id: exerciseId, name: 'Singles', target_bpm: 120, lifetime_goal_minutes: 60};
  const calls = [];
  let refreshes = 0;
  const nodes = renderComponent('ExerciseList', {
    exercises: [exercise],
    sessions: [],
    async onExercisesChanged() { refreshes++; },
  }, {
    '@/utils/exerciseStats': {calculateExerciseStats},
    '@/services/supabase': {supabase: {
      from(table) {
        return {delete() {
          return {async eq(column, value) {
            calls.push({table, column, value});
            return {error: null};
          }};
        }};
      },
    }},
  });
  const dialog = nodes.find(node => node.type === 'dialog');
  const button = label => {
    const node = nodes.find(node => node.type === 'button' && node.props.children === label);
    assert.ok(node, `Missing ${label} button`);
    return node.props.onClick;
  };
  const modal = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
  };
  dialog.props.ref.current = modal;
  assert.ok(nodes.some(node => node.props.children === 'Are you sure you want to remove this exercise?'));

  button('Remove Exercise')();
  assert.equal(modal.open, true);
  assert.deepEqual(calls, []);
  button('Cancel')();
  assert.equal(modal.open, false);
  assert.deepEqual(calls, []);
  assert.equal(refreshes, 0);

  button('Remove Exercise')();
  dialog.props.onCancel();
  modal.close();
  await button('Remove')();
  assert.deepEqual(calls, [], 'native dialog dismissal clears the pending removal');

  button('Remove Exercise')();
  await button('Remove')();
  assert.equal(modal.open, false);
  assert.deepEqual(calls, [
    {table: 'practice_routine_items', column: 'exercise_id', value: exerciseId},
    {table: 'drum_sessions', column: 'exercise_id', value: exerciseId},
    {table: 'exercises', column: 'id', value: exerciseId},
  ]);
  assert.equal(refreshes, 1);
});
