"use client";

import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

import LoginForm from "@/components/LoginForm";

type AuthGateProps = {
  children: ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const { user, loading } = useAuth();

  

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </main>
    );
  }

  if (!user) {
     return <LoginForm />;
}

  return <>{children}</>;
}