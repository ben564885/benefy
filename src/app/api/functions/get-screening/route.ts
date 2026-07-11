import { NextResponse } from "next/server";
import { checkFunctionAuth } from "@/lib/functionAuth";
import { getClient } from "@/lib/store";

// Read-only lookup of the last computed screening. Wired to the Navigator
// agent's `get_screening_result` tool so it can re-fetch the actual verdict
// instead of trusting anything said earlier in the conversation.
export async function POST(request: Request) {
  const authError = checkFunctionAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const clientId: string | undefined = body.client_id;
  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }

  const record = getClient(clientId);
  if (!record || !record.last_screening) {
    return NextResponse.json({ screened: false });
  }

  return NextResponse.json({ screened: true, ...record.last_screening });
}
