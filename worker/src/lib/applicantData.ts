import { getServiceClient } from "./supabase.js";
import { decryptSensitive } from "./crypto.js";
import type { ApplicantData, HouseholdMemberData } from "../adapters/types.js";

interface RawApplicationProfile {
  legal_name: string | null;
  date_of_birth: string | null;
  street_address: string | null;
  city: string | null;
  mailing_zip_code: string | null;
  phone: string | null;
  email: string | null;
  preferred_language: "en" | "es" | null;
  pge_account_number: string | null;
  sfpuc_account_number: string | null;
  ssn_encrypted: string | null;
  household_members: { full_name: string; date_of_birth: string | null; relationship: string | null; has_income: boolean | null; ssn_encrypted: string | null }[];
}

export async function fetchApplicantData(clientId: string, programId: string): Promise<ApplicantData> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("clients").select("*").eq("client_id", clientId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Client ${clientId} not found`);

  const ap = (data.application_profile ?? {}) as RawApplicationProfile;

  const householdMembers: HouseholdMemberData[] = (ap.household_members ?? []).map((m) => ({
    full_name: m.full_name,
    date_of_birth: m.date_of_birth,
    relationship: m.relationship,
    has_income: m.has_income,
    ssn: m.ssn_encrypted ? decryptSensitive(m.ssn_encrypted) : null,
  }));

  return {
    client_id: clientId,
    program_id: programId,
    profile: {
      display_name: data.display_name,
      household_size: data.household_size,
      member_ages: data.member_ages ?? [],
      annual_income_gross: data.annual_income_gross,
      monthly_income_gross: data.monthly_income_gross,
      zip_code: data.zip_code,
      current_programs: data.current_programs ?? [],
      legal_name: ap.legal_name ?? data.display_name,
      date_of_birth: ap.date_of_birth ?? null,
      street_address: ap.street_address ?? null,
      city: ap.city ?? null,
      mailing_zip_code: ap.mailing_zip_code ?? data.zip_code,
      phone: ap.phone ?? null,
      email: ap.email ?? null,
      preferred_language: ap.preferred_language ?? "en",
      pge_account_number: ap.pge_account_number ?? null,
      sfpuc_account_number: ap.sfpuc_account_number ?? null,
      ssn: ap.ssn_encrypted ? decryptSensitive(ap.ssn_encrypted) : null,
      household_members: householdMembers,
    },
  };
}
