"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarPlus, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "./ThemeToggle";
import { UserProvider, useUser, type SessionUser } from "./UserProvider";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/plans/new", label: "New plan", icon: CalendarPlus },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--surface) 82%, transparent)", borderBottom: "1px solid var(--border)" }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="shrink-0">
          <Logo size={26} />
        </Link>

        <nav className="hidden sm:flex items-center gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: active ? "var(--primary-soft)" : "transparent",
                  color: active ? "var(--primary)" : "var(--muted)",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden sm:flex items-center gap-2 pl-1">
            <span className="text-sm font-medium max-w-[10rem] truncate" title={user.email}>
              {user.name}
            </span>
            <button
              onClick={logout}
              aria-label="Sign out"
              className="inline-flex items-center justify-center rounded-lg h-9 w-9"
              style={{ border: "1px solid var(--border-strong)", color: "var(--muted)" }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-30"
      style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}
    >
      <div className="grid grid-cols-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium"
              style={{ color: active ? "var(--primary)" : "var(--muted)" }}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <UserProvider user={user}>
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 pb-24 sm:pb-10 fade-in">{children}</main>
      <BottomNav />
    </UserProvider>
  );
}
