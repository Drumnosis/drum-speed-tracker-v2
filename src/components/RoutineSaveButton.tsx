"use client";

type Props = {
  saving: boolean;
  onSave: () => void;
};

export default function RoutineSaveButton({
  saving,
  onSave,
}: Props) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="mt-8 w-full rounded-lg bg-blue-600 py-4 text-lg font-semibold text-white disabled:bg-gray-400"
    >
      {saving ? "Saving..." : "Save Routine"}
    </button>
  );
}