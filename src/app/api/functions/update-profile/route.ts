import { NextResponse } from "next/server";
import { checkFunctionAuth } from "@/lib/functionAuth";
import { createClient, getClient, updateProfile } from "@/lib/store";
import type { ClientProfile, ImmigrationStatus } from "@/lib/types";

const REQUIRED_KEYS: (keyof ClientProfile)[] = [
  "household_size",
  "sf_resident",
  "immigration_status",
];

function missingRequired(profile: ClientProfile): string[] {
  const missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (profile[key] == null) missing.push(key);
  }
  if (profile.monthly_income_gross == null && profile.annual_income_gross == null) {
    missing.push("monthly_income_gross");
  }
  return missing;
}

// Flat-scalar input contract — this is what the `benefy-update-profile` DO
// Function relays here (see GRADIENT_SETUP.md §1). Arrays are passed as CSV
// strings because DO Functions / agent tool-call schemas only accept
// string/boolean/number parameters.
export async function POST(request: Request) {
  const authError = checkFunctionAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const clientId: string | undefined = body.client_id;
  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }

  let record = getClient(clientId);
  if (!record) {
    record = createClient({
      client_id: clientId,
      display_name: body.display_name || clientId,
      household_size: null,
      monthly_income_gross: null,
      annual_income_gross: null,
      member_ages: [],
      has_senior: null,
      has_disability: null,
      immigration_status: null,
      sf_resident: null,
      zip_code: null,
      current_programs: [],
      intake_notes: "",
      field_status: {},
      last_screened_at: null,
    });
  }

  const patch: Partial<ClientProfile> = {};
  if (body.household_size != null) patch.household_size = Number(body.household_size);
  if (body.monthly_income_gross != null) {
    patch.monthly_income_gross = Number(body.monthly_income_gross);
    patch.annual_income_gross = null;
  }
  if (body.annual_income_gross != null) {
    patch.annual_income_gross = Number(body.annual_income_gross);
    patch.monthly_income_gross = null;
  }
  if (typeof body.member_ages_csv === "string" && body.member_ages_csv.trim()) {
    patch.member_ages = body.member_ages_csv
      .split(",")
      .map((s: string) => Number(s.trim()))
      .filter((n: number) => !Number.isNaN(n));
  }
  if (body.has_senior != null) patch.has_senior = Boolean(body.has_senior);
  if (body.has_disability != null) patch.has_disability = Boolean(body.has_disability);
  if (body.immigration_status != null) {
    patch.immigration_status = body.immigration_status as ImmigrationStatus;
  }
  if (body.sf_resident != null) patch.sf_resident = Boolean(body.sf_resident);
  if (body.zip_code != null) patch.zip_code = String(body.zip_code);
  if (typeof body.current_programs_csv === "string" && body.current_programs_csv.trim()) {
    patch.current_programs = body.current_programs_csv.split(",").map((s: string) => s.trim());
  }

  const updated = updateProfile(clientId, patch);
  const profile = updated!.profile;
  const missing = missingRequired(profile);

  return NextResponse.json({
    profile,
    missing_required_fields: missing,
    ready_to_screen: missing.length === 0,
  });
}
