import { AuthForm } from "@/components/auth/AuthForm";
import { PasskeyLoginButton } from "@/components/auth/PasskeyLoginButton";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { isGoogleConfigured } from "@/lib/auth/google";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="card p-6">
      <h1 className="text-xl font-bold mb-1">Welcome back</h1>
      <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
        Sign in to your training plans.
      </p>
      {error && (
        <p
          className="text-sm rounded-lg px-3 py-2 mb-4"
          style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}
      {isGoogleConfigured() && (
        <div className="mb-4">
          <GoogleButton label="Continue with Google" />
        </div>
      )}
      <AuthForm mode="login" />
      <div className="mt-4">
        <PasskeyLoginButton />
      </div>
    </div>
  );
}
