import { requireUser } from "@/lib/auth";
import { SettingsForm } from "@/components/app/SettingsForm";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <SettingsForm initialName={user.name} email={user.email} initialUnit={user.unitPref} />
    </div>
  );
}
