import { requireUser } from "@/lib/auth";
import { getGarminAccount } from "@/lib/garmin/store";
import { SettingsForm } from "@/components/app/SettingsForm";
import { GarminCard } from "@/components/app/GarminCard";
import { BillingCard } from "@/components/app/BillingCard";
import { isStripeConfigured } from "@/lib/billing/stripe";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; upgraded?: string }>;
}) {
  const user = await requireUser();
  const garmin = await getGarminAccount(user.id);
  const { verified, upgraded } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="flex flex-col gap-5 max-w-xl">
        {upgraded === "1" && (
          <p className="text-sm rounded-lg px-3 py-2" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>
            Welcome to RunPlan Pro! Everything is unlocked. 🎉
          </p>
        )}
        <BillingCard plan={user.plan} stripeEnabled={isStripeConfigured()} />
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
