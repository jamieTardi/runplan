import { AuthForm } from "@/components/auth/AuthForm";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { isGoogleConfigured } from "@/lib/auth/google";

export default function RegisterPage() {
  return (
    <div className="card p-6">
      <h1 className="text-xl font-bold mb-1">Create your account</h1>
      <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
        Start building goal-time training plans.
      </p>
      {isGoogleConfigured() && (
        <div className="mb-4">
          <GoogleButton label="Sign up with Google" />
        </div>
      )}
      <AuthForm mode="register" />
    </div>
  );
}
