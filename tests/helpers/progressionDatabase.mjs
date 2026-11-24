import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const owner='11111111-1111-4111-8111-111111111111';
export const exerciseId='22222222-2222-4222-8222-222222222222';
export async function progressionDatabase() {
  const pg=new PGlite();
  await pg.exec(`
    create role authenticated;
    create table exercises(id uuid primary key, user_id uuid not null, name text default 'Singles',
      starting_bpm integer default 60, target_bpm integer default 120, last_practice_bpm integer);
    create table drum_sessions(id uuid primary key default gen_random_uuid(), user_id uuid not null,
      exercise_id uuid references exercises(id), bpm integer, minutes bigint, created_at timestamptz,
      client_session_id uuid, unique(user_id,client_session_id));
    alter table exercises enable row level security;
    alter table drum_sessions enable row level security;
    create policy exercise_owner on exercises to authenticated using(user_id=current_setting('test.owner')::uuid)
      with check(user_id=current_setting('test.owner')::uuid);
    create policy session_owner on drum_sessions to authenticated using(user_id=current_setting('test.owner')::uuid)
      with check(user_id=current_setting('test.owner')::uuid);
    grant select,insert,update on exercises,drum_sessions to authenticated;
    set test.owner='${owner}';
  `);
  await pg.exec(fs.readFileSync(new URL('../../supabase/migrations/202611150001_exercise_auto_progression.sql',import.meta.url),'utf8'));
  let online=true,loseResponse=false,denyUpdate=false;
  const client=createClient('https://practice-test.example','anon-test-key',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(url,options)=>{
      if(!online) throw new TypeError('Failed to fetch');
      const path=new URL(url), table=path.pathname.split('/').at(-1);
      try {
        if(table==='drum_sessions') {
          const row=JSON.parse(options.body),fields=Object.keys(row);
          await pg.query(`insert into drum_sessions (${fields.join(',')}) values (${fields.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(user_id,client_session_id) do nothing`,Object.values(row));
          if(loseResponse){loseResponse=false;throw new TypeError('Response lost after commit');}
          return new Response(null,{status:201});
        }
        if(table!=='exercises')throw new Error('Unexpected table '+table);
        const id=path.searchParams.get('id')?.slice(3), user=path.searchParams.get('user_id')?.slice(3);
        if(options.method==='PATCH') {
          if(denyUpdate)return Response.json([]);
          const values=JSON.parse(options.body),fields=Object.keys(values);
          const result=await pg.query(`update exercises set ${fields.map((f,i)=>`${f}=$${i+1}`).join(',')} where id=$${fields.length+1} and user_id=$${fields.length+2} returning *`,[...Object.values(values),id,user]);
          return Response.json(new Headers(options.headers).get("accept") === "application/vnd.pgrst.object+json" ? result.rows[0] ?? null : result.rows);
        }
        return Response.json((await pg.query('select * from exercises where id=$1 and user_id=$2',[id,user])).rows);
      }catch(error){
        if(error instanceof TypeError)throw error;
        return Response.json({message:error.message,code:error.code},{status:400});
      }
    }},
  });
  return {pg,client, async reset(settings={}) {
    await pg.exec('reset role; truncate drum_sessions,exercises;');
    const values={id:exerciseId,user_id:owner,last_practice_bpm:100,...settings},fields=Object.keys(values);
    await pg.query(`insert into exercises (${fields.join(',')}) values (${fields.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(values));
    await pg.exec('set role authenticated;');online=true;loseResponse=false;denyUpdate=false;
  },async exercise(){return (await pg.query('select * from exercises where id=$1',[exerciseId])).rows[0];},
  session(bpm=100){return {client_session_id:randomUUID(),exercise_id:exerciseId,bpm,minutes:1,created_at:new Date().toISOString()};},
  setOnline(value){online=value;},loseResponse(){loseResponse=true;},permitUpdates(value){denyUpdate=!value;}};
}
