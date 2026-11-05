import { useId } from "react";

export default function GrooveScribeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-gray-700 dark:text-gray-300">
        Groove Scribe link (optional)
      </label>
      <input
        id={id}
        type="url"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="Paste a Groove Scribe share URL"
        className="w-full rounded border p-3"
      />
    </div>
  );
}
