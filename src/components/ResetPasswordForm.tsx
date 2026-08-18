"use client";

import { useState } from "react";
import { supabase } from "@/services/supabase";

type ResetPasswordFormProps = {
  onDone: () => void;
};

export default function ResetPasswordForm({
  onDone,
}: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function updatePassword() {
    setMessage("");

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Password updated.");

    setTimeout(() => {
      onDone();
    }, 1000);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow">
        <h1 className="mb-6 text-3xl font-bold">
          Choose a new password
        </h1>

        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border p-3"
        />

        {message && (
          <p className="mb-4 text-gray-600">
            {message}
          </p>
        )}

        <button
          onClick={updatePassword}
          className="w-full rounded bg-black p-3 text-white"
        >
          Update Password
        </button>
      </div>
    </main>
  );
}