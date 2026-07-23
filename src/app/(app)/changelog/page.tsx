import type { Metadata } from "next";
import { CHANGELOG, type ChangelogTag } from "@/lib/changelog";
import { MarkChangelogSeen } from "@/components/app/MarkChangelogSeen";

export const metadata: Metadata = { title: "What's new — RunPlan" };

const TAG_STYLE: Record<ChangelogTag, { color: string; background: string }> = {
  New: { color: "var(--primary)", background: "var(--primary-soft)" },
  Improved: { color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 14%, transparent)" },
  Fixed: { color: "var(--muted)", background: "color-mix(in srgb, var(--muted) 14%, transparent)" },
};

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(iso: string) {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}

export default function ChangelogPage() {
  let lastDate = "";
  return (
    <div className="max-w-2xl">
      <MarkChangelogSeen />
      <h1 className="text-2xl font-bold mb-1">What&apos;s new</h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Everything that&apos;s changed in RunPlan, newest first.
      </p>
      <div className="flex flex-col gap-5">
        {CHANGELOG.map((entry, i) => {
          const showDate = entry.date !== lastDate;
          lastDate = entry.date;
          return (
            <div key={`${entry.date}-${entry.title}`}>
              {showDate && (
                <p
                  className={`text-xs font-semibold uppercase tracking-wide mb-2 ${i > 0 ? "mt-3" : ""}`}
                  style={{ color: "var(--faint)" }}
                >
                  {formatDate(entry.date)}
                </p>
              )}
              <section className="card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="font-bold">{entry.title}</h2>
                  <span
                    className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                    style={TAG_STYLE[entry.tag]}
                  >
                    {entry.tag}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--muted)" }}>
                  {entry.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden style={{ color: "var(--faint)" }}>
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          );
        })}
      </div>
    </div>
  );
}
