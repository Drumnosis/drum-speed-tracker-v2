"use client";

import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Browser session drives presentation only; Supabase validates database
    // access with the access token and RLS. A failed refresh is not a sign-out.
    async function restore() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!cancelled) { setUser(data.session?.user ?? null); setError(""); }
      } catch {
        if (!cancelled) setError("Could not restore your signed-in session. Check your connection and retry. Saved practice is kept on this device.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void restore();
    const retry = () => setAttempt(value => value + 1);
    window.addEventListener("online", retry);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setError("");
      setLoading(false);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
      subscription.unsubscribe();
    };
  }, [attempt]);

  return {
    user,
    loading,
    error,
    retry: () => setAttempt(value => value + 1),
  };
}