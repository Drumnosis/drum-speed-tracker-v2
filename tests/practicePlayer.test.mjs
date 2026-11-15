import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as state from '../src/utils/practiceState.ts';
import * as recovery from '../src/utils/practiceRecovery.ts';
import * as identity from '../src/services/practiceIdentity.ts';
import * as sessions from '../src/services/practiceSessions.ts';
import * as metronome from '../src/utils/metronome.ts';
const source=ts.transpileModule(fs.readFileSync(new URL('../src/components/PracticePlayer.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exercise={id:'a',name:'Singles',starting_bpm:60,target_bpm:150};
function environment() {
  const disk=new Map(), rows=new Map();let offline=false, writes=0, remembered=null, bpmOffline=false;
  const storage={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};
  const db={auth:{async getSession(){if(offline)throw new TypeError('Failed to fetch');return {data:{session:{user:{id:'user'}}},error:null};}},from(table){
    if(table==='drum_sessions')return {async upsert(row){assert.ok(Number.isInteger(row.minutes), 'bigint minutes must be integral');if(offline)return {error:{message:'offline'}};writes++;if(!rows.has(row.client_session_id))rows.set(row.client_session_id,row);return {error:null};}};
    assert.equal(table,'exercises','Quick recovery must not access routines');
    return {update(value){const q={eq(){return q;},async select(){if(bpmOffline)return {data:null,error:{message:'offline',code:'network'}};remembered=value.last_practice_bpm;return {data:[{id:'a',...value}],error:null};}};return q;}};
  }};
  return {storage,rows,db,setOffline:v=>{offline=v;},writes:()=>writes,remembered:()=>remembered,setBpmOffline:v=>{bpmOffline=v;}};
}
// Minimal hook host executes the real player effects and event handlers without
// adding a browser dependency. Timers and the database boundary are controlled.
function mount(env, quickPractice=false) {
  let slots=[],cursor=0,effects=[],tree,queued=false,alive=true,now=0;
  const timers=new Map();let timerId=0,available=false,refreshes=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  function schedule(){if(!queued&&alive){queued=true;queueMicrotask(()=>{queued=false;if(alive)render();});}}
  const react={
    useState(initial){const i=cursor++;slots[i]??={value:initial};return [slots[i].value,value=>{const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(next,slots[i].value)){slots[i].value=next;schedule();}}];},
    useRef(value){const i=cursor++;slots[i]??={current:value};return slots[i];},
    useCallback(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={value:fn,deps};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}},
  };
  const noop=()=>{};
  const clicks=[];
  class AudioContext {
    state='running';currentTime=0;destination={};
    async resume(){this.state='running';} async suspend(){this.state='suspended';} async close(){this.state='closed';}
    createOscillator(){const oscillator={frequency:{value:0},connect:noop,disconnect:noop,start:()=>clicks.push(oscillator.frequency.value),stop:noop};return oscillator;}
    createGain(){return {gain:{setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:noop,disconnect:noop};}
  }
  const window={AudioContext,setInterval(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearInterval:id=>timers.delete(id),addEventListener:noop,removeEventListener:noop,confirm:()=>true};
  const modules={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'@/services/supabase':{supabase:env.db},'@/services/practiceIdentity':identity,'@/services/practiceSessions':sessions,'@/utils/practiceRecovery':recovery,'@/utils/practiceState':state,'@/utils/clientId':{createClientId:()=> 'stable-id'},'@/utils/metronome':metronome,'./GrooveNotation':{default:()=>null}};
  const exports={};vm.runInNewContext(source,{exports,require:name=>{assert.ok(modules[name],name);return modules[name];},window,document:{hidden:false,addEventListener:noop,removeEventListener:noop},navigator:{},localStorage:env.storage,performance:{now:()=>now},console});
  const props={quickPractice,routineId:null,exercises:[exercise],onExit:noop,onSessionSaved:async()=>{refreshes++;},onRecoveryChange:value=>{available=value;}};
  function render(){cursor=0;effects=[];tree=exports.default(props);for(const fn of effects)fn();}
  render();
  const nodes=()=>{const found=[];function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return;}found.push(n);visit(n.props?.children);}visit(tree);return found;};
  return {clicks, pulse(){for(const timer of [...timers.values()])if(timer.ms!==100&&timer.ms!==15000)timer.fn();}, intervals:()=>[...timers.values()].map(t=>t.ms),async settle(){for(let i=0;i<30;i++)await Promise.resolve();},nodes,available:()=>available,refreshes:()=>refreshes,
    tick(ms){now+=ms;for(const timer of [...timers.values()])if(timer.ms===100)timer.fn();},
    unmount(){alive=false;for(const slot of slots)slot?.cleanup?.();},
    button(label){const node=nodes().find(n=>n.type==='button'&&n.props.children===label);assert.ok(node,`Missing ${label}`);node.props.onClick();},
  };
}
for(const action of ['navigation','reload'])test(`real player ${action} restores Quick Practice and completes once with no recovery banner`,async()=>{
  const env=environment();let player=mount(env,true);await player.settle();
  player.nodes().find(n=>n.props?.id==='quick-exercise').props.onChange({target:{value:'a'}});await player.settle();
  player.nodes().find(n=>n.props?.id==='quick-duration').props.onChange({target:{value:'1'}});await player.settle();
  player.button('Start');await player.settle();player.tick(4000);await player.settle();player.tick(1000);await player.settle();
  const before=JSON.parse(env.storage.getItem('drum-practice:v1:user'));
  assert.equal(before.quickPractice,true);assert.equal(before.remainingMs,59000);
  player.unmount();player=mount(env,false);await player.settle();
  assert.ok(player.nodes().some(n=>n.type==='h2'&&n.props.children==='Quick Practice'));
  assert.deepEqual(JSON.parse(env.storage.getItem('drum-practice:v1:user')),before);
  player.button('Continue practice');player.tick(59000);await player.settle();
  assert.equal(env.rows.size,1);assert.equal(env.writes(),1);assert.equal(player.refreshes(),1);
  assert.equal(player.available(),false);assert.equal(env.storage.getItem('drum-practice:v1:user'),null);
  player.unmount();assert.equal(env.storage.getItem('drum-practice:v1:user'),null);
});
test('real player load error offers working retry and preserves recovery without duplicate writes',async()=>{
  const env=environment();const saved=state.createQuickPractice(exercise,'original-id');env.storage.setItem('drum-practice:v1:user',JSON.stringify(saved));
  env.setOffline(true);const player=mount(env,false);await player.settle();
  assert.ok(player.nodes().some(n=>n.props?.role==='alert'));
  assert.equal(env.storage.getItem('drum-practice:v1:user'),JSON.stringify(saved));
  env.setOffline(false);player.button('Retry loading practice');await player.settle();
  assert.ok(player.nodes().some(n=>n.type==='h2'&&n.props.children==='Quick Practice'));
  assert.equal(env.rows.size,0);assert.equal(env.writes(),0);player.unmount();
});
test('real player named-routine recovery keeps routine identity and settings',async()=>{
  const env=environment();const s=state.createPractice([{...exercise,bpm:85,duration:2,sessionId:'routine-a'},{...exercise,id:'b',bpm:90,duration:3,sessionId:'routine-b'}]);
  const saved={...s,index:1,phase:'paused',remainingMs:12345,subdivision:3};env.storage.setItem('drum-practice:v1:user',JSON.stringify(saved));
  const player=mount(env,false);await player.settle();
  assert.ok(player.nodes().some(n=>n.type==='h2'&&n.props.children==='Practice Routine'));
  assert.deepEqual(JSON.parse(env.storage.getItem('drum-practice:v1:user')),saved);
  assert.equal(env.writes(),0);player.unmount();
});
test('real player offline completion stays recoverable until Retry save succeeds once',async()=>{
  const env=environment();const saved={...state.createQuickPractice(exercise,'offline-id'),phase:'running',remainingMs:1000};env.storage.setItem('drum-practice:v1:user',JSON.stringify(saved));
  const player=mount(env,false);await player.settle();player.button('Continue practice');env.setOffline(true);player.tick(1000);await player.settle();
  assert.equal(player.available(),true);assert.equal(JSON.parse(env.storage.getItem('drum-practice:v1:user')).pending.length,1);
  assert.equal(env.rows.size,0);env.setOffline(false);player.button('Retry save');await player.settle();
  assert.equal(player.available(),false);assert.equal(env.rows.size,1);assert.equal(env.writes(),1);assert.equal(env.storage.getItem('drum-practice:v1:user'),null);player.unmount();
});
test('Quick Practice duration control rejects fractions and saves a whole minute with accelerated time',async()=>{
  const env=environment();const player=mount(env,true);await player.settle();
  player.nodes().find(n=>n.props?.id==='quick-exercise').props.onChange({target:{value:'a'}});await player.settle();
  const input=player.nodes().find(n=>n.props?.id==='quick-duration');assert.equal(input.props.min,'1');assert.equal(input.props.step,'1');
  input.props.onChange({target:{value:'0.1'}});await player.settle();
  assert.equal(JSON.parse(env.storage.getItem('drum-practice:v1:user')).routine[0].duration,1);
  player.button('Start');await player.settle();player.tick(4000);await player.settle();player.tick(60000);await player.settle();
  assert.equal([...env.rows.values()][0].minutes,1);assert.equal(env.writes(),1);assert.equal(player.available(),false);player.unmount();
});
for(const phase of ['complete','paused'])test(`legacy fractional Quick Practice (${phase}) can be cleared without rounding time or saving a session`,async()=>{
  const env=environment();const s=state.createQuickPractice({...exercise,last_practice_bpm:82},'legacy-id');s.routine[0].duration=0.1;s.phase=phase;s.remainingMs=0;
  if(phase==='complete')s.pending=[{client_session_id:'legacy-id',exercise_id:'a',bpm:82,minutes:0.1,created_at:new Date().toISOString()}];
  env.storage.setItem('drum-practice:v1:user',JSON.stringify(s));const player=mount(env,false);await player.settle();
  assert.equal(env.writes(),0);player.button('Clear invalid Quick Practice');await player.settle();
  assert.equal(env.rows.size,0);assert.equal(env.remembered(),82);assert.equal(player.available(),false);
  assert.equal(env.storage.getItem('drum-practice:v1:user'),null);player.unmount();assert.equal(env.storage.getItem('drum-practice:v1:user'),null);
});
test('clearing legacy invalid save offline retains BPM for retry but never inserts fractional or rounded time',async()=>{
  const env=environment();const s=state.createQuickPractice({...exercise,last_practice_bpm:83},'legacy-id');s.phase='complete';s.routine[0].duration=0.1;
  s.pending=[{client_session_id:'legacy-id',exercise_id:'a',bpm:83,minutes:0.1,created_at:new Date().toISOString()}];
  env.storage.setItem('drum-practice:v1:user',JSON.stringify(s));const player=mount(env,false);await player.settle();env.setBpmOffline(true);
  player.button('Clear invalid Quick Practice');await player.settle();assert.equal(player.available(),true);assert.equal(env.writes(),0);
  assert.deepEqual(JSON.parse(env.storage.getItem('drum-practice:v1:user')).pending,[]);
  env.setBpmOffline(false);player.button('Retry save');await player.settle();assert.equal(env.remembered(),83);assert.equal(env.rows.size,0);assert.equal(player.available(),false);player.unmount();
});

for (const quick of [false,true]) test(`real player mute preserves timer, BPM and session (${quick ? 'Quick Practice' : 'routine'})`, async()=>{
  const env=environment();
  const initial=quick ? state.createQuickPractice(exercise,'muted-session') : state.createPractice([{...exercise,bpm:60,duration:1,sessionId:'muted-session'},{...exercise,id:'b',bpm:80,duration:1,sessionId:'next-session'}]);
  env.storage.setItem('drum-practice:v1:user',JSON.stringify(initial));
  const player=mount(env,quick);await player.settle();player.button('Continue practice');await player.settle();
  const snapshot=()=>JSON.parse(env.storage.getItem('drum-practice:v1:user'));
  const select=value=>player.nodes().find(n=>n.props?.id==='subdivision').props.onChange({target:{value:String(value)}});
  assert.ok(player.nodes().some(n=>n.type==='button'&&n.props.children==='Metronome On'));
  player.button('Metronome On');await player.settle();assert.deepEqual(snapshot(),initial);
  player.button('Start');await player.settle();assert.equal(player.clicks.length,1);
  for(let i=0;i<3;i++)player.pulse();assert.equal(player.clicks.length,4,'count-in stays audible when muted');
  const counting=snapshot();player.button('Metronome Off');await player.settle();player.button('Metronome On');await player.settle();
  assert.equal(player.clicks.length,4,'toggle does not restart count-in');assert.deepEqual(snapshot(),counting);
  player.tick(4000);await player.settle();const count=player.clicks.length;
  player.pulse();player.tick(1000);await player.settle();assert.equal(player.clicks.length,count);assert.equal(snapshot().remainingMs,59000);
  const bpm=player.nodes().find(n=>n.props?.['aria-label']==='Practice BPM');assert.equal(bpm.props.disabled,false);
  bpm.props.onChange({target:{value:'90'}});await player.settle();assert.equal(snapshot().routine[0].bpm,90);
  select(6);await player.settle();const before=snapshot();
  player.button('Metronome Off');await player.settle();assert.deepEqual(snapshot(),before);assert.equal(player.clicks.length,count+1);
  assert.ok(player.intervals().some(ms=>Math.abs(ms-60000/90/6)<1e-8));
  player.pulse();assert.equal(player.clicks.at(-1),700);
  select(3);await player.settle();assert.deepEqual(snapshot(),{...before,subdivision:3});
  player.button('Metronome On');await player.settle();player.tick(59000);await player.settle();
  assert.equal(env.rows.size,1);const row=[...env.rows.values()][0];assert.equal(row.bpm,90);assert.equal(row.minutes,1);assert.equal(row.client_session_id,'muted-session');assert.equal(env.remembered(),90);
  if(!quick){assert.equal(snapshot().phase,'rest');assert.equal(snapshot().index,0);const sounds=player.clicks.length;player.tick(1000);await player.settle();assert.equal(snapshot().restMs,14000);assert.equal(player.clicks.length,sounds+1,'rest pulses remain audible');}
  player.unmount();
});
