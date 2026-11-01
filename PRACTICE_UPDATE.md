# Local practice update

Before testing, apply `supabase/migrations/202611010001_practice_updates.sql` in the SQL Editor of this project's Supabase dashboard. The app does not apply it automatically. Refresh the app afterwards.

The SQL adds starting/last practice BPM to exercises and a nullable client session UUID with a unique index to drum_sessions. Existing sessions, authentication and row-level security policies are retained. Existing exercises get their configured routine BPM as Starting BPM (falling back to Target BPM); their most recent recorded session seeds Last Practice BPM. New exercises have a separately entered Starting BPM.

## Behaviour

- The practice timer is independent of BPM and metronome settings. The count-in remains four main beats; rest remains 15 seconds.
- Practice snapshots and outstanding saves are stored per signed-in user on this device/browser. A snapshot includes the routine, its position, BPM, exact remaining milliseconds, running/paused/rest state and subdivision.
- Backgrounding or leaving the player freezes practice. Reopening Practice offers Continue; a previously paused exercise or rest remains paused. Time away is not credited. An interrupted count-in restarts its four beats without consuming practice time.
- Exit keeps the snapshot for later. End saved routine abandons unfinished exercises and keeps completed entries, including pending saves.
- Every completion immediately attempts to save. Failed saves remain queued on this device and retry on reconnect, every 15 seconds while the player is open, or with Retry save. Keep/return to the player until pending saves clear. Stable client UUIDs and the database unique index prevent retries/restoration from creating duplicates.
- Each exercise starts at Last Practice BPM if available, otherwise Starting BPM. Changing practice BPM never changes Target BPM. Explicit BPM edits saved in the routine builder also set the next practice BPM. Manual historical entries affect Statistics, not the remembered player tempo.
- A supported browser requests screen wake lock while the routine is active, including pauses/rests. Finishing, exiting or backgrounding releases it. The browser may deny it (for example in low-power mode). Wake lock requires a secure context: HTTPS or localhost. Plain HTTP on a phone using a LAN IP cannot validate this feature. See https://www.w3.org/TR/screen-wake-lock/.
- Recovery is local to the current browser/device, not cloud-synced. Clearing site data removes it. Private browsing or blocked storage can prevent recovery; the player displays a warning.

## Checks

Use Node 22.6+ (Node 24 was used here). Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`. The existing *_old.tsx backup files are excluded from TypeScript/lint because one contains pasted non-code text; the backup files and components.zip are untouched.

## Browser test checklist

1. Add an exercise with Starting BPM 60 and Target BPM 120. Include it and another exercise in a saved short routine. Start it: it should use 60 and count four beats.
2. Pause partway through; change BPM to 62. Verify the exercise time stays fixed. Resume, finish, and check Statistics immediately, before the whole routine ends. There should be one entry at 62.
3. During rest, change BPM with the buttons and slider: the countdown must continue. Pause Rest; note the displayed seconds; change BPM several times and wait. The seconds must stay fixed. Resume Rest: it continues from the saved time, with a pulse each second.
4. Try all four subdivisions. Main beats and the first-beat accent should remain clear; the count-in still has four beats.
5. Refresh/close/reopen or background during running practice, paused practice, running rest and paused rest. Open Continue saved practice, then Continue practice. Check the exercise, BPM and time; paused states must stay paused. Time away must not be added. Complete the routine and confirm no duplicate sessions.
6. Switch offline just before an exercise ends. See the pending-save message; reconnect or reopen Practice and retry. Confirm exactly one entry after repeated retry/refresh. Also test leaving during rest after a completion.
7. Use Skip before starting, during count-in and while running. The next exercise should wait for Start, and the skipped exercise must have no new session. Skip the last exercise; routine ends.
8. Use Log practice on an exercise in Exercises or Statistics. Enter BPM, minutes and an earlier date. Confirm the date, BPM, time totals and chart in Statistics. A quick double click must create only one entry.
9. Practise the same exercise in a new routine run: it should use its last BPM; Target BPM should still be 120. A different exercise should remember its own tempo independently.
10. On the iPhone Home Screen app over HTTPS, start practice and leave the screen untouched through exercise/rest/pause. Check it stays awake, then Exit/finish and check normal screen locking resumes. Also check layout and audio in light/dark modes. A denied/unsupported wake lock must not stop practice.

No deployment, push, subscription, notation, quiz or automatic BPM increment is included.
