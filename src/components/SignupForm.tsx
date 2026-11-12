"use client";

import { useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { alreadyRegisteredMessage, signupErrorMessage, signupOutcome, validateSignup } from "@/utils/signup";

export default function SignupForm({ onSignIn }: { onSignIn: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  async function handleSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const validation = validateSignup(email, password, confirmation);
    if (validation) { setError(validation); return; }
    submitting.current = true;
    setPending(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) { setError(signupErrorMessage(error)); return; }
      const outcome = signupOutcome(data);
      if (outcome === "signed-in") return; // AuthGate responds to Supabase's SIGNED_IN event.
      if (outcome === "failed") { setError(signupErrorMessage(null)); return; }
      if (outcome === "already-registered") { setError(alreadyRegisteredMessage); return; }
      setSubmittedEmail(email.trim());
      setPassword("");
      setConfirmation("");
    } catch (error) {
      setError(signupErrorMessage(error));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  const inputClass = "mt-1 mb-4 w-full rounded border border-gray-400 bg-white p-3 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow sm:p-8 dark:bg-gray-900">
        <h1 className="mb-2 text-3xl font-bold">Create account</h1>
        {submittedEmail ? (
          <>
            <p role="status" className="mb-6 break-words">Check your email at {submittedEmail}. Open the confirmation email and click the link to confirm your account before signing in. Check your spam or junk folder too.</p>
            <button type="button" onClick={() => onSignIn(submittedEmail)} className="w-full rounded bg-black p-3 text-white dark:bg-white dark:text-black">Back to sign in</button>
          </>
        ) : (
          <>
            <p className="mb-6 text-gray-600 dark:text-gray-300">Create your Drum Speed Tracker account.</p>
            <form onSubmit={handleSignup} noValidate>
              <fieldset disabled={pending}>
                <label htmlFor="signup-email">Email address</label>
                <input id="signup-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                <label htmlFor="signup-password">Password</label>
                <input id="signup-password" type="password" autoComplete="new-password" required aria-describedby="password-help" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
                <p id="password-help" className="mb-4 text-sm text-gray-600 dark:text-gray-300">Use at least 6 characters. Your account may require a longer password or a mix of uppercase and lowercase letters, numbers and symbols.</p>
                <label htmlFor="signup-confirmation">Confirm password</label>
                <input id="signup-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} className={inputClass} />
                {error && <p role="alert" className="mb-4 text-red-700 dark:text-red-400">{error}</p>}
                <button type="submit" className="w-full rounded bg-black p-3 text-white disabled:opacity-60 dark:bg-white dark:text-black">{pending ? "Creating account..." : "Create account"}</button>
              </fieldset>
            </form>
            <button type="button" disabled={pending} onClick={() => onSignIn(email.trim())} className="mt-3 w-full rounded border p-3 disabled:opacity-60">Already have an account? Sign in</button>
          </>
        )}
      </div>
    </main>
  );
}
