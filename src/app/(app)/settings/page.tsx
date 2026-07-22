import { requireUser } from "@/lib/auth";
import { getGarminAccount } from "@/lib/garmin/store";
import { SettingsForm } from "@/components/app/SettingsForm";
import { GarminCard } from "@/components/app/GarminCard";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const user = await requireUser();
  const garmin = await getGarminAccount(user.id);
  const { verified } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="flex flex-col gap-5 max-w-xl">
        <GarminCard
          initialConnected={!!garmin}
          initialUserName={garmin?.garminUserName ?? null}
          initialLastSyncAt={garmin?.lastSyncAt?.toISOString() ?? null}
        />
        {verified === "1" && (
          <p className="text-sm rounded-lg px-3 py-2" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>
            Email verified — thanks!
          </p>
        )}
        {verified === "0" && (
          <p className="text-sm rounded-lg px-3 py-2" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
            That verification link is invalid or expired — resend one below.
          </p>
        )}
        <SettingsForm
          initialName={user.name}
          email={user.email}
          initialUnit={user.unitPref}
          emailVerified={!!user.emailVerifiedAt}
        />
      </div>
    </div>
  );
}
