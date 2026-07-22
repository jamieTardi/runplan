import { NextResponse } from "next/server";
import { requireUserForApi } from "@/lib/auth/api";
import { registrationOptions } from "@/lib/auth/webauthn";

export async function POST() {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await registrationOptions(auth.user));
}
