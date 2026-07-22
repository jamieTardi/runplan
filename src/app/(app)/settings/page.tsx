import { requireUser } from "@/lib/auth";
import { getGarminAccount } from "@/lib/garmin/store";
import { SettingsForm } from "@/components/app/SettingsForm";
import { GarminCard } from "@/components/app/GarminCard";

export default async function SettingsPage() {
  const user = await requireUser();
  const garmin = await getGarminAccount(user.id);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="flex flex-col gap-5 max-w-xl">
        <GarminCard
          initialConnected={!!garmin}
          initialUserName={garmin?.garminUserName ?? null}
          initialLastSyncAt={garmin?.lastSyncAt?.toISOString() ?? null}
        />
        <SettingsForm initialName={user.name} email={user.email} initialUnit={user.unitPref} />
      </div>
    </div>
  );
}
