import { ForgotForm } from "@/components/auth/ForgotForm";

export default function ForgotPasswordPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-bold mb-1">Forgot your password?</h1>
      <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <ForgotForm />
    </div>
  );
}
