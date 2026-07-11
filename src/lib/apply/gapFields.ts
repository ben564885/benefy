import type { ApplicationProfile, ClientProfile, ProgramDefinition } from "@/lib/types";

// Fields the apply flow's gap-fill step can ask about directly (top-level
// ApplicationProfile keys). Per-household-member fields (e.g. LIHEAP's
// "SSN for every income earner") aren't covered here — the worker's
// dry-run surfaces those as needs_human if the household_members array is
// incomplete, since their count varies per client rather than being a
// fixed field the UI can render as a single input.
const APPLICATION_PROFILE_KEYS = new Set<keyof ApplicationProfile>([
  "legal_name",
  "date_of_birth",
  "street_address",
  "city",
  "mailing_zip_code",
  "phone",
  "email",
  "preferred_language",
  "pge_account_number",
  "sfpuc_account_number",
  "ssn_encrypted",
]);

export interface GapField {
  key: keyof ApplicationProfile;
  program_ids: string[];
}

// Which required_application_fields (across the given programs) are still
// unset on this client's profile. Used both to gate enqueueing in the
// apply API route and to render the consolidated "we need a few more
// details" form before consent.
export function missingApplicationFields(
  profile: ClientProfile,
  programs: ProgramDefinition[],
): GapField[] {
  const byKey = new Map<keyof ApplicationProfile, string[]>();
  for (const program of programs) {
    for (const rawKey of program.application.required_application_fields ?? []) {
      if (!APPLICATION_PROFILE_KEYS.has(rawKey as keyof ApplicationProfile)) continue;
      const key = rawKey as keyof ApplicationProfile;
      if (profile.application_profile[key] != null && profile.application_profile[key] !== "") continue;
      const existing = byKey.get(key) ?? [];
      existing.push(program.program_id);
      byKey.set(key, existing);
    }
  }
  return Array.from(byKey.entries()).map(([key, program_ids]) => ({ key, program_ids }));
}
