"use client";

import { useState } from "react";
import { supabase } from "@/services/supabase";
import { getGrooveScribeLink } from "@/utils/grooveScribe";
import GrooveScribeField from "./GrooveScribeField";

export default function EditGrooveScribeLink({
  exerciseId,
  url,
  onSaved,
}: {
  exerciseId: string;
  url?: string | null;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (value === null) return;
    const link = getGrooveScribeLink(value);
    if (value.trim() && !link) {
      setError("Paste a valid Groove Scribe share URL, or leave the field blank.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Sign in to save notation.");

      const { error } = await supabase.from("exercises")
        .update({ groove_scribe_url: link?.original ?? null })
        .eq("id", exerciseId).eq("user_id", user.id)
        .select("id").single();
      if (error) throw new Error(error.message);

      await onSaved();
      setValue(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the Groove Scribe link.");
    } finally {
      setSaving(false);
    }
  }

  if (value === null) {
    return (
      <button type="button" onClick={() => setValue(url ?? "")}
        className="mt-2 py-2 text-sm text-blue-700 underline dark:text-blue-300">
        {url ? "Edit notation link" : "Add notation link"}
      </button>
    );
  }

  return (
    <form className="mt-3" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={saving} className="min-w-0 space-y-2 disabled:opacity-60">
        <GrooveScribeField value={value} onChange={setValue} />
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
            {saving ? "Saving…" : "Save link"}
          </button>
          <button type="button" className="rounded border px-4 py-2" onClick={() => { setValue(null); setError(""); }}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}
