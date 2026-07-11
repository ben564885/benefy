import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { encryptSensitive, last4 } from "@/lib/apply/crypto";
import { updateApplicationProfile } from "@/lib/store";
import type { ApplicationProfile, HouseholdMember } from "@/lib/types";

// Body may include plaintext "ssn" and per-member "ssn" fields — these are
// encrypted here (server-side, before touching Supabase) and never echoed
// back or logged. Everything else is a direct ApplicationProfile patch.
interface RequestBody extends Partial<Omit<ApplicationProfile, "ssn_encrypted" | "ssn_last4" | "household_members">> {
  ssn?: string;
  household_members?: (Omit<HouseholdMember, "ssn_encrypted"> & { ssn?: string })[];
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }

  const body: RequestBody = await request.json().catch(() => ({}));
  const { ssn, household_members, ...rest } = body;

  const patch: Partial<ApplicationProfile> = { ...rest };
  if (typeof ssn === "string" && ssn.trim()) {
    patch.ssn_encrypted = encryptSensitive(ssn.trim());
    patch.ssn_last4 = last4(ssn);
  }
  if (household_members) {
    patch.household_members = household_members.map((m) => ({
      full_name: m.full_name,
      date_of_birth: m.date_of_birth ?? null,
      relationship: m.relationship ?? null,
      has_income: m.has_income ?? null,
      ssn_encrypted: typeof m.ssn === "string" && m.ssn.trim() ? encryptSensitive(m.ssn.trim()) : null,
    }));
  }

  const record = await updateApplicationProfile(id, patch);
  if (!record) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Redact anything sensitive before it goes back to the browser — the
  // caller only needs to know the write succeeded and which fields are
  // now set, not the encrypted payloads.
  const { ssn_encrypted: _se, household_members: hm, ...safeProfile } = record.profile.application_profile;
  return NextResponse.json({
    application_profile: {
      ...safeProfile,
      household_members: hm.map((m) => ({ ...m, ssn_encrypted: m.ssn_encrypted ? "on_file" : null })),
      ssn_encrypted: _se ? "on_file" : null,
    },
  });
}
