"use client";

import { useState } from "react";
import { getGrooveScribeLink } from "@/utils/grooveScribe";

export default function GrooveNotation({ url }: { url?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const groove = getGrooveScribeLink(url);
  if (!groove) return null;

  return (
    <section aria-label="Groove Scribe notation" className="mt-4 rounded-lg border border-gray-300 p-3 text-left dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        {groove.embed ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(current => !current)}
            className="py-2 text-sm font-semibold"
          >
            {expanded ? "Hide notation" : "Show notation"}
          </button>
        ) : <span className="py-2 text-sm">Preview unavailable</span>}
        <a href={groove.original} target="_blank" rel="noopener noreferrer"
          className="py-2 text-sm text-blue-700 underline dark:text-blue-300">
          Open in Groove Scribe
        </a>
      </div>
      {expanded && groove.embed && (
        <iframe
          title="Drum notation from Groove Scribe"
          src={groove.embed}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          className="mt-2 h-48 w-full rounded bg-white"
        />
      )}
    </section>
  );
}
