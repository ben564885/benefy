import { getServiceClient } from "./supabase.js";

// Private bucket — create it once via the Supabase dashboard (Storage ->
// New bucket -> "submission-artifacts", Public: off) or the CLI. Holds
// dry-run/submit screenshots and generated PDFs, all of which can contain
// full applicant PII, so signed URLs only, never a public bucket.
const BUCKET = "submission-artifacts";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function saveArtifact(
  clientId: string,
  submissionId: string,
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const supabase = getServiceClient();
  const path = `${clientId}/${submissionId}/${Date.now()}-${filename}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError) throw signError;
  return data.signedUrl;
}
