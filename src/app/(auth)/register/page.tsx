import { AuthForm } from "@/components/auth/AuthForm";

export default function RegisterPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-bold mb-1">Create your account</h1>
      <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
        Start building goal-time training plans.
      </p>
      <AuthForm mode="register" />
    </div>
  );
}
