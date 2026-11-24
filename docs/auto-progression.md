# Auto Progression

## Apply the database change

Before testing this version against Supabase, open the Supabase SQL Editor and
run the **entire contents** of:

`supabase/migrations/202611150001_exercise_auto_progression.sql`

Run it once, including `begin;` and `commit;`. This migration has not been applied
by Codex. No existing exercise, session or routine is deleted or rewritten, and
no RLS policy is removed or relaxed. Existing exercises default to progression
off with a zero counter. Historical sessions are not counted retrospectively.

## How it works

Each exercise stores `auto_progress_enabled`, `auto_progress_after` (4/8/12),
`auto_progress_by` (1/2/5), and `auto_progress_count`. The existing
`last_practice_bpm` remains the tempo used to start the next practice.
Starting BPM and Target BPM remain unchanged.

Practice Player completions set `drum_sessions.practice_completed` to true.
An INSERT trigger locks the exercise and commits its counter and next Practice
BPM in the same transaction as the session. The existing unique
`(user_id, client_session_id)` key makes retries no-ops. If the exercise update
fails, the session insert rolls back and remains queued on the device.
Saving the session no longer writes its old BPM a second time after progression.
The actual session BPM is retained in Statistics.

Changes to remembered BPM reset the count. Enabling/disabling progression or
changing its threshold/increment also resets the count. Saving an unchanged BPM
on Start/Resume does not reset it. Target BPM caps automatic increases; manual
BPM controls retain their existing range. An active exercise's BPM is never
automatically changed. Quick Practice and all named routines share the same
exercise counter. Manual history entries do not count toward Auto Progression.

Manual reset intent is also kept in the existing device recovery snapshot while
a BPM save is pending. If the exercise finishes offline first, its pending
completion carries `reset_progress` so that reconnecting counts it as session 1
at the manually selected BPM, including when rapid edits return to the old BPM.

The Practice screen switch saves immediately to the exercise. A failed setting
save displays an error and leaves the displayed saved setting unchanged; retry
the switch when online. Practice time continues while settings save.

## Local checks

1. Apply the migration above, then run `npm run dev`.
2. Create an exercise at Starting BPM 100, Target BPM 120. Confirm progression
   defaults to Off and the two dropdowns are hidden. Enable it, choose 4 sessions
   and +2 BPM, save, and refresh to check persistence. Edit these settings from
   the exercise's Save Auto Progression controls.
3. Complete four one-minute sessions, mixing Quick Practice and two named
   routines containing that exercise. Check counts 1/4, 2/4, 3/4. The fourth
   session must stay at 100 until it finishes; the next practice starts at 102
   with a zero counter. Statistics must record the four completed sessions at 100.
4. Repeat with 8 and 12 sessions, and +1 and +5 BPM. Automated tests cover all
   nine combinations if a full manual run would take too long.
5. At BPM 118 with Target 120 and +5, complete the threshold: the next BPM is
   exactly 120 and the UI says Target reached. Further completions stay at 120.
6. After partial progress, manually change Practice BPM. Confirm the count resets
   and the next completed exercise counts as 1 at the new BPM. Starting BPM and
   Target BPM must not change. Also check manual edits saved in a routine.
7. Turn progression off during practice: the timer and BPM must not change.
   Complete an exercise while off; it must not count. Turn it back on and refresh:
   the setting persists and counting restarts from zero at the current BPM.
8. Skip an exercise, exit partway through another, and end a saved incomplete
   practice: none should count. Pause/resume and rest pause/resume must preserve
   the count and any earned increase.
9. Disconnect before completion, then reload/reconnect and Continue/Retry save.
   Confirm one Statistics row, one count, and no duplicate BPM increase. Also
   reload during practice and confirm the exact remaining time is restored.
10. Check sextuplets and other subdivisions, metronome mute/unmute, audible
    four-beat count-in while muted, rest sounds, Skip, screen awake, Groove Scribe,
    Statistics and a normal sign-in. A manual Log practice entry should affect
    Statistics but not progression.

Automated checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
The tests run the migration only in an isolated in-memory PostgreSQL engine
(PGlite); they never connect to Supabase.
