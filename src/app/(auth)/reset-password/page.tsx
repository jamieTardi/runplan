import { Suspense } from "react";
import { ResetForm } from "@/components/auth/ResetForm";

export default function ResetPasswordPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-bold mb-1">Choose a new password</h1>
      <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
        Set a new password for your account.
      </p>
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
