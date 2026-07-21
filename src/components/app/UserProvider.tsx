"use client";

import { createContext, useContext } from "react";
import type { Unit } from "@/lib/units";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  unitPref: Unit;
}

const UserContext = createContext<SessionUser | null>(null);

export function UserProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser(): SessionUser {
  const u = useContext(UserContext);
  if (!u) throw new Error("useUser must be used within UserProvider");
  return u;
}

/** Convenience: the current display unit. */
export function useUnit(): Unit {
  return useUser().unitPref;
}
