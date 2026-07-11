import { NextResponse } from "next/server";
import { buildPrefill } from "@/lib/applicationPrefill";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; programId: string }> },
) {
  const { id, programId } = await context.params;
  const outcome = buildPrefill(id, programId);
  if (!outcome.ok) {
    const status = outcome.error === "Client not found" || outcome.error === "Program not found" ? 404 : 400;
    return NextResponse.json({ error: outcome.error }, { status });
  }
  return NextResponse.json(outcome.data);
}
