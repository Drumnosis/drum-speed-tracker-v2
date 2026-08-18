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
  const { user, loading } = useAuth();
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
  if (!user) {
    return <LoginForm />;
  }

  return <>{children}</>;
}