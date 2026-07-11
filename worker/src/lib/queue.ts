import { getServiceClient } from "./supabase.js";

export interface SubmissionRow {
  id: string;
  client_id: string;
  program_id: string;
  apply_mode: "web_submit" | "pdf_fill" | "assisted";
  status: string;
}

// "queued" rows are new jobs (dry-run pass); "submitting" rows are jobs a
// human just confirmed (commit pass). Both are claimable by the same loop.
const CLAIMABLE_STATUSES = ["queued", "submitting"];

// A claim older than this is assumed to belong to a worker that crashed
// mid-job (single worker instance today — see .do/app.yaml instance_count
// — so this is a crash-recovery timeout, not a concurrency mechanism). If
// the worker ever scales beyond one instance, replace this
// select-then-conditional-update with a `FOR UPDATE SKIP LOCKED` RPC.
const STALE_CLAIM_MS = 10 * 60 * 1000;

export async function claimNextSubmission(): Promise<SubmissionRow | null> {
  const supabase = getServiceClient();
  const staleThreshold = new Date(Date.now() - STALE_CLAIM_MS).toISOString();

  const { data: candidates, error } = await supabase
    .from("submissions")
    .select("id, client_id, program_id, apply_mode, status, claimed_at")
    .in("status", CLAIMABLE_STATUSES)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw error;

  for (const candidate of candidates ?? []) {
    const claimedAt = candidate.claimed_at as string | null;
    if (claimedAt && claimedAt >= staleThreshold) continue;

    const { data: claimed, error: claimError } = await supabase
      .from("submissions")
      .update({ claimed_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .eq("status", candidate.status)
      .select("id, client_id, program_id, apply_mode, status")
      .maybeSingle();
    if (claimError) throw claimError;
    if (claimed) return claimed as SubmissionRow;
  }
  return null;
}

interface StatusPatch {
  error?: string | null;
  receipt_note?: string;
  newArtifacts?: unknown[];
}

export async function markStatus(id: string, status: string, patch: StatusPatch = {}): Promise<void> {
  const supabase = getServiceClient();
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (patch.error !== undefined) update.error = patch.error;
  if (patch.receipt_note !== undefined) update.receipt_note = patch.receipt_note;

  if (patch.newArtifacts && patch.newArtifacts.length > 0) {
    const { data } = await supabase.from("submissions").select("artifacts").eq("id", id).maybeSingle();
    const existing = (data?.artifacts as unknown[]) ?? [];
    update.artifacts = [...existing, ...patch.newArtifacts];
  }

  const { error } = await supabase.from("submissions").update(update).eq("id", id);
  if (error) throw error;
}
