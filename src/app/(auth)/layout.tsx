import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm fade-in">
        <div className="flex justify-center mb-6">
          <Link href="/login">
            <Logo size={34} />
          </Link>
        </div>
        {children}
      </div>
      <p className="mt-8 text-xs" style={{ color: "var(--faint)" }}>
        Science-based plans · Pfitzinger volume · Daniels VDOT pacing
      </p>
    </div>
  );
}
