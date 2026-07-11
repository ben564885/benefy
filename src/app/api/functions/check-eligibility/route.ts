import { NextResponse } from "next/server";
import { checkFunctionAuth } from "@/lib/functionAuth";
import { screenAndStore } from "@/lib/store";

// This IS the "AI never decides eligibility" centerpiece: the DO Function
// wired to the Intake agent's `check_eligibility` tool relays here, and this
// route is the only code path that invokes the deterministic engine
// (screenClient in lib/engine.ts) to produce a verdict. The model never sees
// the rules — it only ever sees this route's JSON response.
export async function POST(request: Request) {
  const authError = checkFunctionAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const clientId: string | undefined = body.client_id;
  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }

  const updated = await screenAndStore(clientId);
  if (!updated || !updated.last_screening) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json(updated.last_screening);
}
