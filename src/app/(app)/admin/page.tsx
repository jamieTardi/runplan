import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AdminPanel } from "@/components/admin/AdminPanel";

export default async function AdminPage() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin</h1>
      <AdminPanel />
    </div>
  );
}
