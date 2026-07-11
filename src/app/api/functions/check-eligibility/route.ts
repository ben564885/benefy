import { NextResponse } from "next/server";
import { checkFunctionAuth } from "@/lib/functionAuth";
import { missingCoreFields } from "@/lib/gradient/intakeExtractor";
import { getClient, screenAndStore } from "@/lib/store";

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

  const client = await getClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // The model's own instructions tell it to wait for all required fields,
  // but that's a soft rule — this is the hard gate that actually stops a
  // premature/incomplete report from reaching the client.
  const missing = missingCoreFields(client.profile);
  if (missing.length > 0) {
    return NextResponse.json({
      error: "missing_required_fields",
      missing_fields: missing.map((m) => m.key),
      message: `Cannot screen yet — still need: ${missing.map((m) => m.prompt).join(" ")}`,
    });
  }

  const updated = await screenAndStore(clientId);
  if (!updated || !updated.last_screening) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json(updated.last_screening);
}
