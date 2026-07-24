"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

// The push service wants the VAPID public key as raw bytes.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function NotificationsCard({ publicKey }: { publicKey: string | null }) {
  // null = still detecting; false = this browser/context can't do push.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!publicKey || !window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setSupported(false);
        return;
      }
      // getRegistration (not .ready) — .ready never settles if registration failed.
      const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
      if (cancelled) return;
      if (!reg) {
        setSupported(false);
        return;
      }
      const sub = await reg.pushManager.getSubscription().catch(() => null);
      if (cancelled) return;
      setSupported(true);
      setEnabled(!!sub);
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMsg({ ok: false, text: "Notifications are blocked — allow them for RunPlan in your device settings." });
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) throw new Error("Service worker not registered");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => {});
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save the subscription");
      }
      setEnabled(true);
      setMsg({ ok: true, text: "Daily reminders are on for this device." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to enable notifications" });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe().catch(() => {});
      }
      setEnabled(false);
    } catch {
      setMsg({ ok: false, text: "Failed to turn off notifications" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="font-bold mb-1 flex items-center gap-2">
        <Bell size={18} /> Notifications
      </h2>
      {supported === false ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Push notifications aren&apos;t available in this browser. They work in the RunPlan Android
          app and in browsers over HTTPS with notifications allowed.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <label
            className="flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer"
            style={{ background: "var(--surface-2)" }}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => (e.target.checked ? enable() : disable())}
              disabled={busy || supported === null}
              className="h-5 w-5 mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="font-semibold text-sm block">Daily workout reminder</span>
              <span className="text-xs" style={{ color: "var(--faint)" }}>
                A morning notification on this device with the day&apos;s planned session — distance
                and pace at a glance. Rest days stay quiet.
              </span>
            </span>
          </label>
          {msg && (
            <p className="text-sm" style={{ color: msg.ok ? "var(--accent)" : "var(--danger)" }}>{msg.text}</p>
          )}
        </div>
      )}
    </section>
  );
}
