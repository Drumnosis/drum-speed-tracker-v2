begin;

-- Some deployments enforce one routine per user with a constraint or index.
do $$
declare
  unique_key record;
begin
  for unique_key in
    select i.indexrelid::regclass as index_name, c.conname
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attname = 'user_id'
    left join pg_constraint c on c.conindid = i.indexrelid
      and c.conrelid = i.indrelid and c.contype = 'u'
    where i.indrelid = 'public.practice_routines'::regclass
      and i.indisunique and not i.indisprimary
      and i.indnkeyatts = 1 and i.indkey[0] = a.attnum
  loop
    if unique_key.conname is null then
      execute format('drop index %s', unique_key.index_name);
    else
      execute format('alter table public.practice_routines drop constraint %I', unique_key.conname);
    end if;
  end loop;
end;
$$;

create index if not exists practice_routines_user_id_idx
  on public.practice_routines (user_id);

update public.practice_routines
set name = 'My Routine'
where name is null or name !~ '[^[:space:]]';

alter table public.practice_routines
  alter column name set not null,
  add constraint practice_routines_nonblank_name check (name ~ '[^[:space:]]');

-- Replace any non-cascading routine_id foreign key, keeping exercise FKs intact.
do $$
declare
  routine_fk record;
begin
  for routine_fk in
    select c.conname, c.confdeltype
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attname = 'routine_id'
    where c.conrelid = 'public.practice_routine_items'::regclass
      and c.confrelid = 'public.practice_routines'::regclass
      and c.contype = 'f' and c.conkey = array[a.attnum]
  loop
    if routine_fk.confdeltype = 'c' then
      return;
    end if;
    execute format('alter table public.practice_routine_items drop constraint %I', routine_fk.conname);
  end loop;

  alter table public.practice_routine_items
    add constraint practice_routine_items_routine_cascade_fk
    foreign key (routine_id) references public.practice_routines(id) on delete cascade;
end;
$$;

create index if not exists practice_routine_items_routine_id_idx
  on public.practice_routine_items (routine_id);

alter table public.practice_routines enable row level security;

create policy named_routines_owner_select on public.practice_routines
  for select to authenticated using (user_id = (select auth.uid()));

create policy named_routines_owner_insert on public.practice_routines
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy named_routines_owner_update on public.practice_routines
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy named_routines_owner_delete on public.practice_routines
  for delete to authenticated using (user_id = (select auth.uid()));

grant update (name), delete on public.practice_routines to authenticated;

-- Run with the caller's permissions and existing item/exercise RLS policies.
create function public.save_practice_routine(
  p_id uuid, p_name text, p_create boolean, p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'Sign in to save a routine.';
  end if;

  if p_create then
    -- A retry after a lost response can reuse the same ID.
    insert into public.practice_routines (id, user_id, name)
      values (p_id, owner_id, p_name)
      on conflict (id) do nothing;
  end if;

  -- Lock the parent row so edits and deletion serialize.
  update public.practice_routines set name = p_name
    where id = p_id and user_id = owner_id;
  if not found then
    raise exception 'Routine not found.';
  end if;

  -- A rename leaves item rows untouched.
  if p_items is null then
    return;
  end if;

  if exists (
    select 1
    from jsonb_populate_recordset(null::public.practice_routine_items, p_items) i
    where i.bpm is null or i.bpm not between 30 and 300
      or i.duration is null or not (i.duration > 0 and i.duration < 'Infinity'::numeric)
      or not exists (
        select 1 from public.exercises e where e.id = i.exercise_id and e.user_id = owner_id
      )
  ) then
    raise exception 'Check the exercises, BPM and duration in this routine.';
  end if;

  delete from public.practice_routine_items where routine_id = p_id;

  insert into public.practice_routine_items (routine_id, exercise_id, position, bpm, duration)
    select p_id, i.exercise_id, i.position, i.bpm, i.duration
    from jsonb_populate_recordset(null::public.practice_routine_items, p_items) i;

  -- An explicit BPM edit in the builder still sets the remembered practice BPM.
  update public.exercises e set last_practice_bpm = i.bpm
    from jsonb_to_recordset(p_items) as i(exercise_id uuid, bpm numeric, remember_bpm boolean)
    where e.id = i.exercise_id and e.user_id = owner_id and i.remember_bpm;
end;
$$;

revoke all on function public.save_practice_routine(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.save_practice_routine(uuid, text, boolean, jsonb) to authenticated;

commit;
