import { NextResponse } from "next/server";
import { requireUserForApi } from "@/lib/auth/api";
import { registrationOptions } from "@/lib/auth/webauthn";

export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  const plain = body?.plain === true;
  return NextResponse.json(await registrationOptions(auth.user, plain));
}
