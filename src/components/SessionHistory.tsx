import type { DrumSession } from "@/types";

type SessionHistoryProps = {
  sessions: DrumSession[];
};

export default function SessionHistory({
  sessions,
}: SessionHistoryProps) {
  if (sessions.length === 0) {
    return (
      <div className="mt-6">
        <h4 className="mb-3 font-semibold">
          Latest Sessions
        </h4>

        <p className="text-sm text-gray-500">
          No sessions recorded yet.
        </p>
      </div>
    );
  }

  const latestSessions = sessions.slice(0, 5);

  return (
    <div className="mt-6">
      <h4 className="mb-3 font-semibold">
        Latest Sessions
      </h4>

      <div className="space-y-2">
        {latestSessions.map((session) => (
          <div
            key={session.id}
            className="flex justify-between rounded bg-gray-100 px-3 py-2 text-sm"
          >
            <span>
              {new Date(session.created_at).toLocaleDateString(
                "en-GB"
              )}
            </span>

            <span>
              {session.bpm} BPM
            </span>

            <span>
              {session.minutes} mins
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}