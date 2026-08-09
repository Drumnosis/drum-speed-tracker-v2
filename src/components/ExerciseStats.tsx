type ExerciseStatsProps = {
  latest: number | null;
  best: number | null;
  average: number | null;
  progress: number | null;
  remaining: number | null;
  totalMinutes: number;
  remainingMinutes: number;
  percentageComplete: number;
};

export default function ExerciseStats({
  latest,
  best,
  average,
  progress,
  remaining,
  totalMinutes,
  remainingMinutes,
  percentageComplete,
}: ExerciseStatsProps) {
  function value(v: number | null) {
    return v === null ? "-" : v;
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border p-4">
      <div>
        <div className="text-sm text-gray-500">Latest</div>
        <div className="text-lg font-semibold">
          {value(latest)}
        </div>
      </div>

      <div>
        <div className="text-sm text-gray-500">Best</div>
        <div className="text-lg font-semibold">
          {value(best)}
        </div>
      </div>

      <div>
        <div className="text-sm text-gray-500">Average</div>
        <div className="text-lg font-semibold">
          {value(average)}
        </div>
      </div>

      <div>
        <div className="text-sm text-gray-500">Progress</div>
        <div className="text-lg font-semibold">
          {progress === null ? "-" : `${progress}%`}
        </div>
      </div>

      <div>
        <div className="text-sm text-gray-500">
          Remaining BPM
        </div>
        <div className="text-lg font-semibold">
          {value(remaining)}
        </div>
      </div>

      <div>
        <div className="text-sm text-gray-500">
          Minutes Practised
        </div>
        <div className="text-lg font-semibold">
          {totalMinutes}
        </div>
      </div>

      <div>
        <div className="text-sm text-gray-500">
          Minutes Remaining
        </div>
        <div className="text-lg font-semibold">
          {remainingMinutes}
        </div>
      </div>

      <div>
        <div className="text-sm text-gray-500">
          Goal Complete
        </div>
        <div className="text-lg font-semibold">
          {percentageComplete}%
        </div>
      </div>

      <div className="col-span-2">
        <div className="h-3 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-black"
            style={{
              width: `${Math.min(percentageComplete, 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}