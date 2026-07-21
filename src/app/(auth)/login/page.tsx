import { AuthForm } from "@/components/auth/AuthForm";

export default function LoginPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-bold mb-1">Welcome back</h1>
      <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
        Sign in to your training plans.
      </p>
      <AuthForm mode="login" />
    </div>
  );
}
