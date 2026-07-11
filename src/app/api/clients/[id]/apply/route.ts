import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { getProgram } from "@/lib/engine";
import { missingApplicationFields } from "@/lib/apply/gapFields";
import { enqueueSubmissions, listSubmissionsForClient, recordConsent } from "@/lib/store";
import type { ProgramDefinition } from "@/lib/types";

// Bump when consent copy changes materially — recorded on every consent
// row so "what did the user actually agree to" stays answerable even
// after the UI copy moves on.
const CONSENT_TEXT_VERSION = "apply-consent-v1";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }
  return NextResponse.json({ submissions: await listSubmissionsForClient(id) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }
  const record = owned.record;

  const body = await request.json().catch(() => ({}));
  const programIds: string[] = Array.isArray(body.program_ids) ? body.program_ids : [];
  if (programIds.length === 0) {
    return NextResponse.json({ error: "program_ids is required" }, { status: 400 });
  }

  const programs: ProgramDefinition[] = [];
  for (const programId of programIds) {
    const program = getProgram(programId);
    if (!program) return NextResponse.json({ error: `Unknown program_id: ${programId}` }, { status: 400 });
    const result = record.last_screening?.results.find((r) => r.program_id === programId);
    if (!result || result.status !== "likely_eligible") {
      return NextResponse.json(
        { error: `${program.name} is not marked likely_eligible for you yet — complete your screening first.` },
        { status: 400 },
      );
    }
    programs.push(program);
  }

  const missing = missingApplicationFields(record.profile, programs);
  if (missing.length > 0) {
    return NextResponse.json({ missing_fields: missing }, { status: 409 });
  }

  const consent = await recordConsent(id, programIds, CONSENT_TEXT_VERSION);
  const submissions = await enqueueSubmissions(
    id,
    programs.map((p) => ({ program_id: p.program_id, apply_mode: p.application.apply_mode ?? "assisted" })),
    consent.id,
  );

  return NextResponse.json({ submissions }, { status: 201 });
}
