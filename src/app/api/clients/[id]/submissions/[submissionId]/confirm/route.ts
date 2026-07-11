import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { confirmSubmission } from "@/lib/store";

// The one moment a human explicitly authorizes an already-filled form to
// actually go out — flips a row from "awaiting_review" to "submitting",
// which the worker then picks up and executes. See src/lib/types.ts
// SubmissionStatus for the full state machine.
export async function POST(_request: Request, context: { params: Promise<{ id: string; submissionId: string }> }) {
  const { id, submissionId } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }

  const submission = await confirmSubmission(id, submissionId);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found or not awaiting review" }, { status: 404 });
  }
  return NextResponse.json({ submission });
}
