"use client";

export type ProgressSettings = { auto_progress_enabled: boolean; auto_progress_after: number; auto_progress_by: number };
export const defaultProgressSettings: ProgressSettings = { auto_progress_enabled: false, auto_progress_after: 4, auto_progress_by: 2 };

export default function AutoProgressFields({ value, onChange, disabled = false }: {
  value: ProgressSettings; onChange: (value: ProgressSettings) => void; disabled?: boolean;
}) {
  return <div className="flex flex-wrap items-center gap-3">
    <label className="font-medium text-blue-800 dark:text-blue-200">Auto Progression <select aria-label="Auto Progression" value={String(value.auto_progress_enabled)} disabled={disabled}
      onChange={e => onChange({ ...value, auto_progress_enabled: e.target.value === "true" })}
      className="rounded border border-blue-200 bg-blue-50 p-2 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-950 dark:hover:bg-blue-900">
      <option value="false">Off</option><option value="true">On</option>
    </select></label>
    {value.auto_progress_enabled && <>
      <label>Increase after <select aria-label="Increase after" value={value.auto_progress_after} disabled={disabled}
        onChange={e => onChange({ ...value, auto_progress_after: Number(e.target.value) })}
        className="rounded border bg-white p-2 dark:bg-gray-800">
        {[4,8,12].map(n => <option key={n} value={n}>{n} sessions</option>)}
      </select></label>
      <label>Increase by <select aria-label="Increase by" value={value.auto_progress_by} disabled={disabled}
        onChange={e => onChange({ ...value, auto_progress_by: Number(e.target.value) })}
        className="rounded border bg-white p-2 dark:bg-gray-800">
        {[1,2,5].map(n => <option key={n} value={n}>{n} BPM</option>)}
      </select></label>
    </>}
  </div>;
}
