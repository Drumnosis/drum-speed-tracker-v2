# Student account signup

The login screen now offers Create account, with email, password and confirmation only. Passwords are not trimmed. The client validates the six-character Supabase minimum; Supabase remains authoritative for project-specific length, character and leaked-password requirements. Errors are translated into plain English. A returned session enters the existing AuthGate automatically. Without a session, the screen asks the student to confirm their email before signing in. Duplicate-account errors (including an empty identities response) offer sign-in/password reset. Supabase may conceal existing accounts, so not every duplicate attempt can reliably be identified.

Forgot Password, ResetPasswordForm and AuthGate were not changed. No practice code, data, migrations or backup files were changed.

## Supabase checks

No new table, profile, trigger or migration is required for signup. The app uses the existing public Supabase client; never put a service-role key in the browser.

The repository does not contain the project's full schema or live Auth configuration. A read-only request to the public Auth settings endpoint failed even outside the sandbox, so the current confirmation setting could not be verified. Supabase hosted projects normally require email confirmation; both settings are supported by this implementation.

In the Supabase dashboard verify:

- Authentication: email/password provider and new-user signup are enabled. Check the Confirm email setting rather than disabling it for testing.
- URL Configuration: allow `http://localhost:3000/` as a redirect URL (and the exact local origin if using a different port). Keep the production Site URL intact. Confirmation requests return to the current app origin.
- Email delivery: confirm SMTP/delivery works for tester addresses. The default Supabase email service may restrict recipients and has low rate limits; use configured SMTP for external students if necessary.
- RLS is enabled on exercises, drum_sessions, practice_routines and practice_routine_items. Existing permissive policies must not grant access to other users: Postgres combines permissive policies with OR.
- Exercises, sessions and routines need owner-scoped SELECT/INSERT/UPDATE/DELETE policies as used by the app: `USING (user_id = (select auth.uid()))` for existing rows and `WITH CHECK (user_id = (select auth.uid()))` for new/updated rows. Authenticated users need the corresponding table privileges.
- Routine-item policies must check ownership through the parent routine for reads/deletes, and both the parent routine AND referenced exercise on insert/update. Session insert/update policies should also require the referenced exercise to belong to the signed-in user. Do not use unconditional policies or disable RLS.
- The existing named-routines migration defines owner-scoped parent policies and a security-invoker save function that checks exercise ownership. It relies on pre-existing item/exercise RLS. The original exercise/session/item policies are absent from this repository, so live isolation cannot be certified from source alone. Review them in the dashboard before inviting students; no speculative policy changes were applied.

## Local test

1. Run `npm run dev`, open `http://localhost:3000` in a private browser window, and choose Create account.
2. Submit blank/invalid email, fewer than six password characters, and different passwords; verify the messages. Try a password rejected by any stricter configured Supabase rules.
3. Use a genuinely unused email you can receive and matching strong passwords. Submit once. With confirmation enabled, check the clear inbox instruction, open the email link, then sign in if needed. Without confirmation, the app opens immediately.
4. Add your own exercise, create a routine, complete a short practice and check its session/statistics. Sign out and back in; confirm these persist.
5. Register a second unused address in a separate private browser session. Verify neither student can see the other's exercises, routines or sessions. Also test cross-account IDs directly against the Data API with each student's token: SELECT must return no other-user rows and INSERT/UPDATE/DELETE must not affect them. UI filtering alone does not prove RLS isolation.
6. Try an already registered email, offline signup, and repeated submits. Confirm useful errors and no duplicate in-flight requests. Supabase can intentionally mask duplicate accounts as a confirmation response.
7. From sign-in, enter an email and use Forgot password. Confirm the existing reset email/link/password update flow still works.
8. Check both screens at phone width and in light/dark mode, including long email addresses and errors.

Automated checks: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. Real email delivery, dashboard configuration and two-user RLS checks require access to the live project and test mailboxes; they were not performed automatically. Nothing has been pushed or deployed.

## Verification results

- `npm test`: 31 tests passed, including signup validation, error messages and response outcomes.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- `npm run build`: passed with network access on retry. The initial sandboxed attempt could not fetch the existing Geist/Geist Mono fonts.
- No browser automation dependency is installed. Mobile/dark-mode styling was reviewed in source; interactive browser and real-account checks remain manual.
