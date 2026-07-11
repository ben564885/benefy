import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { buildPrefill } from "@/lib/applicationPrefill";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; programId: string }> },
) {
  const { id, programId } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }

  const outcome = await buildPrefill(id, programId);
  if (!outcome.ok) {
    const status = outcome.error === "Client not found" || outcome.error === "Program not found" ? 404 : 400;
    return NextResponse.json({ error: outcome.error }, { status });
  }
  return NextResponse.json(outcome.data);
}
