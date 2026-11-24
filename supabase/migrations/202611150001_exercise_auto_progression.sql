-- Run this entire file in Supabase SQL Editor before using this release.
-- Existing data and RLS policies are preserved. No historical sessions count.
begin;

alter table public.exercises
  add column auto_progress_enabled boolean not null default false,
  add column auto_progress_after integer not null default 4 check (auto_progress_after in (4,8,12)),
  add column auto_progress_by integer not null default 2 check (auto_progress_by in (1,2,5)),
  add column auto_progress_count integer not null default 0 check (auto_progress_count >= 0);

-- Only completed Practice Player exercises opt in, not manually logged history.
alter table public.drum_sessions add column practice_completed boolean not null default false;
-- Carries a manual reset that was still queued when the exercise finished.
alter table public.drum_sessions add column reset_progress boolean not null default false;
alter table public.drum_sessions add constraint completed_practice_valid check (
  not practice_completed or (client_session_id is not null and minutes > 0 and bpm between 30 and 300)
);

create function public.reset_exercise_progression() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.auto_progress_enabled is distinct from old.auto_progress_enabled
    or new.auto_progress_after is distinct from old.auto_progress_after
    or new.auto_progress_by is distinct from old.auto_progress_by
    or (pg_trigger_depth() = 1 and new.last_practice_bpm is distinct from old.last_practice_bpm)
  then
    new.auto_progress_count := 0;
  end if;
  return new;
end;
$$;
create trigger reset_exercise_progression before update on public.exercises
for each row execute function public.reset_exercise_progression();

create function public.complete_exercise_progression() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  exercise public.exercises%rowtype;
  completed integer;
  next_bpm integer;
begin
  if not new.practice_completed then return new; end if;
  -- Serialize completions/settings/BPM changes for this exercise. Invoker
  -- permissions and owner predicate retain the existing RLS boundary.
  select * into exercise from public.exercises
    where id = new.exercise_id and user_id = new.user_id for update;
  if not found then raise exception 'Exercise unavailable to this account'; end if;
  completed := 0;
  next_bpm := new.bpm;
  if exercise.auto_progress_enabled and new.bpm < exercise.target_bpm then
    completed := case when not new.reset_progress and exercise.last_practice_bpm = new.bpm
      then exercise.auto_progress_count else 0 end + 1;
    if completed >= exercise.auto_progress_after then
      next_bpm := least(new.bpm + exercise.auto_progress_by, exercise.target_bpm, 300);
      completed := 0;
    end if;
  end if;
  update public.exercises set last_practice_bpm = next_bpm, auto_progress_count = completed
    where id = exercise.id and user_id = new.user_id;
  if not found then raise exception 'Exercise Practice BPM update denied'; end if;
  return new;
end;
$$;
-- AFTER INSERT does not run for ON CONFLICT DO NOTHING retries. An error in
-- the exercise update rolls back the session insert as well.
create trigger complete_exercise_progression after insert on public.drum_sessions
for each row execute function public.complete_exercise_progression();

grant select (auto_progress_enabled, auto_progress_after, auto_progress_by, auto_progress_count),
  insert (auto_progress_enabled, auto_progress_after, auto_progress_by),
  update (auto_progress_enabled, auto_progress_after, auto_progress_by, auto_progress_count)
  on public.exercises to authenticated;
grant select (practice_completed), insert (practice_completed) on public.drum_sessions to authenticated;
grant select (reset_progress), insert (reset_progress) on public.drum_sessions to authenticated;

commit;
