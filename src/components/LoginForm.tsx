"use client";

import { useState } from "react";
import { supabase } from "@/services/supabase";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
const [message, setMessage] = useState("");
  async function handleSignIn() {
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }
  }
async function handleForgotPassword() {
  setError("");
  setMessage("");

  if (!email) {
    setError("Enter your email address first.");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    {
      redirectTo: `${window.location.origin}/`,
    }
  );

  if (error) {
    setError(error.message);
  } else {
    setMessage("Password reset email sent. Check your inbox.");
  }
}
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold mb-2">
          Drum Speed Tracker
        </h1>

        <p className="text-gray-600 mb-6">
          Sign in to continue.
        </p>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded p-3 mb-4"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded p-3 mb-4"
        />

        {error && (
          <p className="mb-4 text-red-600">
            {error}
          </p>
        )}
{message && (
  <p className="mb-4 text-green-600">
    {message}
  </p>
)}
<button
  onClick={handleSignIn}
  className="w-full rounded bg-black text-white p-3"
>
  Sign In
</button>

<button
  onClick={handleForgotPassword}
  className="mt-3 w-full rounded border p-3"
>
  Forgot password?
</button>
      </div>
    </main>
  );
}
