import { getProgram } from "@/lib/engine";
import { getClient } from "@/lib/store";
import type { ClientProfile } from "@/lib/types";

function formatValue(profile: ClientProfile, key: string): string {
  const value = profile[key as keyof ClientProfile];
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export interface PrefillField {
  form_field: string;
  profile_key: string;
  value: string;
}

export interface PrefillData {
  program_id: string;
  program_name: string;
  form_name: string;
  form_url: string;
  required_documents: string[];
  fields: PrefillField[];
  label: string;
  generated_at: string;
}

export type PrefillOutcome = { ok: true; data: PrefillData } | { ok: false; error: string };

export function buildPrefill(clientId: string, programId: string): PrefillOutcome {
  const record = getClient(clientId);
  if (!record) return { ok: false, error: "Client not found" };

  const program = getProgram(programId);
  if (!program) return { ok: false, error: "Program not found" };

  const result = record.last_screening?.results.find((r) => r.program_id === programId);
  if (!result || result.status !== "likely_eligible") {
    return { ok: false, error: "Program is not marked likely_eligible for this client — screen the client first." };
  }

  const fields = Object.entries(program.application.prefill_map).map(([profileKey, formField]) => ({
    form_field: formField,
    profile_key: profileKey,
    value: formatValue(record.profile, profileKey),
  }));

  return {
    ok: true,
    data: {
      program_id: program.program_id,
      program_name: program.name,
      form_name: program.application.form_name,
      form_url: program.application.form_url,
      required_documents: program.required_documents ?? [],
      fields,
      label: "Pre-filled draft — review and submit. This tool does not submit applications electronically.",
      generated_at: new Date().toISOString(),
    },
  };
}
