import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/app/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell
      user={{ id: user.id, name: user.name, email: user.email, unitPref: user.unitPref, isAdmin: user.isAdmin }}
    >
      {children}
    </AppShell>
  );
}
