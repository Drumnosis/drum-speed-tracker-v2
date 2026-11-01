-- Apply once in the Supabase SQL editor before testing this update.
begin;
alter table public.exercises add column if not exists starting_bpm integer;
alter table public.exercises add column if not exists last_practice_bpm integer;
-- Preserve the configured routine tempo for existing exercises where possible.
update public.exercises e set starting_bpm = coalesce(
  (select i.bpm from public.practice_routine_items i where i.exercise_id = e.id order by i.position limit 1),
  e.target_bpm, 60) where starting_bpm is null;
alter table public.exercises alter column starting_bpm set default 60;
alter table public.exercises alter column starting_bpm set not null;
update public.exercises e set last_practice_bpm = (
  select s.bpm from public.drum_sessions s where s.exercise_id = e.id
    and s.user_id = e.user_id order by s.created_at desc limit 1
) where last_practice_bpm is null;
alter table public.drum_sessions add column if not exists client_session_id uuid;
create unique index if not exists drum_sessions_user_client_session_unique
  on public.drum_sessions(user_id, client_session_id);
-- Existing sessions and row-level security policies remain in place.
commit;
