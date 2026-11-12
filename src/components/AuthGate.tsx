"use client";

import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/services/supabase";

import LoginForm from "@/components/LoginForm";
import ResetPasswordForm from "@/components/ResetPasswordForm";
type AuthGateProps = {
  children: ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const { user, loading, error, retry } = useAuth();
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </main>
    );
  }
if (recoveryMode) {
  return (
    <ResetPasswordForm
      onDone={() => setRecoveryMode(false)}
    />
  );
}
  if (!user && error) {
    return <main className="min-h-screen bg-gray-100 p-6 dark:bg-gray-950 dark:text-gray-100">
      <p role="alert">{error}</p>
      <button onClick={retry} className="mt-4 rounded bg-blue-600 px-4 py-3 text-white">Retry connection</button>
    </main>;
  }
  if (!user) {
    return <LoginForm />;
  }

  return <>{children}</>;
}