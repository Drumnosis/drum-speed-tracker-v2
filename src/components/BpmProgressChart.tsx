"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DrumSession } from "@/types";

type BpmProgressChartProps = {
  sessions: DrumSession[];
  targetBpm: number;
};

export default function BpmProgressChart({
  sessions,
  targetBpm,
}: BpmProgressChartProps) {
  const chartData = [...sessions]
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() -
        new Date(b.created_at).getTime()
    )
    .map((session) => ({
      date: new Date(session.created_at).toLocaleDateString(
        "en-GB",
        {
          day: "2-digit",
          month: "short",
        }
      ),
      bpm: session.bpm,
    }));

  if (chartData.length === 0) {
    return (
      <p className="mt-4 text-sm text-gray-500">
        No BPM history yet.
      </p>
    );
  }

  return (
    <div className="mt-4 h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="date" />

          <YAxis
            domain={[
              (minimum: number) =>
                Math.max(0, Math.floor(minimum - 10)),
              (maximum: number) =>
                Math.ceil(
                  Math.max(maximum, targetBpm) + 10
                ),
            ]}
          />

          <Tooltip />

          <ReferenceLine
            y={targetBpm}
            stroke="#dc2626"
            strokeWidth={3}
            label={{
              value: "Target BPM",
              position: "insideTopRight",
              fill: "#dc2626",
            }}
          />

          <Line
            type="monotone"
            dataKey="bpm"
            name="BPM"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}