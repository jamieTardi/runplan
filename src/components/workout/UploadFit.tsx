"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

/**
 * Manual fallback: upload a .fit (or Garmin "Export Original" .zip) for this
 * workout. On success the page refreshes and shows the full activity panel.
 */
export function UploadFit({ workoutId }: { workoutId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/workouts/${workoutId}/upload`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".fit,.zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button
        className="btn btn-ghost self-start"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={{ border: "1px dashed var(--border-strong)" }}
      >
        <Upload size={16} /> {busy ? "Importing…" : "Upload .fit file"}
      </button>
      <p className="text-xs" style={{ color: "var(--faint)" }}>
        In Garmin Connect: open the activity → ⚙ → “Export Original” — upload the downloaded
        .zip (or the .fit inside it). This works even when the Garmin sync is unavailable.
      </p>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      )}
    </div>
  );
}
