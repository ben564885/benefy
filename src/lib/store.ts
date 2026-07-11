import { randomUUID } from "crypto";
import { screenClient } from "@/lib/engine";
import { supabase } from "@/lib/supabase";
import type { ChatMessage, ClientProfile, ClientRecord, TraceStep } from "@/lib/types";

// Supabase-backed persistence (see supabase/schema.sql). One row per
// screening session; chat_history / trace / last_screening are jsonb blobs
// replaced wholesale, mirroring the old in-memory Map shape 1:1 so callers
// didn't need to change beyond adding `await`.
export interface ClientRow {
  client_id: string;
  display_name: string;
  household_size: number | null;
  monthly_income_gross: number | null;
  annual_income_gross: number | null;
  member_ages: number[];
  has_senior: boolean | null;
  has_disability: boolean | null;
  immigration_status: string | null;
  sf_resident: boolean | null;
  zip_code: string | null;
  current_programs: string[];
  intake_notes: string;
  field_status: Record<string, ClientProfile["field_status"][string]>;
  last_screened_at: string | null;
  last_screening: ClientRecord["last_screening"];
  chat_history: ChatMessage[];
  trace: TraceStep[];
}

// supabase-js's generic Database inference collapses to `never` for
// insert/update payloads when the client is created without an explicit
// generated schema type (no CLI/db link here — see src/lib/supabase.ts).
// One cast in one place, instead of `as any` scattered through every call;
// result shapes are still verified manually via ClientRow below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clientsTable(): any {
  return supabase().from("clients");
}

function rowToRecord(row: ClientRow): ClientRecord {
  const {
    client_id,
    display_name,
    household_size,
    monthly_income_gross,
    annual_income_gross,
    member_ages,
    has_senior,
    has_disability,
    immigration_status,
    sf_resident,
    zip_code,
    current_programs,
    intake_notes,
    field_status,
    last_screened_at,
    last_screening,
  } = row;
  const profile: ClientProfile = {
    client_id,
    display_name,
    household_size,
    monthly_income_gross,
    annual_income_gross,
    member_ages,
    has_senior,
    has_disability,
    immigration_status: immigration_status as ClientProfile["immigration_status"],
    sf_resident,
    zip_code,
    current_programs,
    intake_notes,
    field_status,
    last_screened_at,
  };
  return { profile, last_screening };
}

function profileToRow(profile: ClientProfile): Omit<ClientRow, "last_screening" | "chat_history" | "trace"> {
  return {
    client_id: profile.client_id,
    display_name: profile.display_name,
    household_size: profile.household_size,
    monthly_income_gross: profile.monthly_income_gross,
    annual_income_gross: profile.annual_income_gross,
    member_ages: profile.member_ages,
    has_senior: profile.has_senior,
    has_disability: profile.has_disability,
    immigration_status: profile.immigration_status,
    sf_resident: profile.sf_resident,
    zip_code: profile.zip_code,
    current_programs: profile.current_programs,
    intake_notes: profile.intake_notes,
    field_status: profile.field_status,
    last_screened_at: profile.last_screened_at,
  };
}

export async function listClients(): Promise<ClientRecord[]> {
  const { data, error } = await clientsTable()
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as ClientRow[]).map(rowToRecord);
}

export async function getClient(clientId: string): Promise<ClientRecord | undefined> {
  const { data, error } = await clientsTable()
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToRecord(data as unknown as ClientRow) : undefined;
}

export async function createClient(profile: ClientProfile): Promise<ClientRecord> {
  const { data, error } = await clientsTable()
    .insert({ ...profileToRow(profile), last_screening: null, chat_history: [], trace: [] })
    .select("*")
    .single();
  if (error) throw error;
  return rowToRecord(data as unknown as ClientRow);
}

export async function updateProfile(
  clientId: string,
  patch: Partial<ClientProfile>,
): Promise<ClientRecord | undefined> {
  const existing = await getClient(clientId);
  if (!existing) return undefined;
  const merged = { ...existing.profile, ...patch };
  const { data, error } = await clientsTable()
    .update(profileToRow(merged))
    .eq("client_id", clientId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? rowToRecord(data as unknown as ClientRow) : undefined;
}

export async function screenAndStore(clientId: string): Promise<ClientRecord | undefined> {
  const existing = await getClient(clientId);
  if (!existing) return undefined;
  const screening = screenClient(existing.profile);
  const { data, error } = await clientsTable()
    .update({ last_screening: screening, last_screened_at: screening.screened_at })
    .eq("client_id", clientId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? rowToRecord(data as unknown as ClientRow) : undefined;
}

export async function getChatHistory(clientId: string): Promise<ChatMessage[]> {
  const { data, error } = await clientsTable()
    .select("chat_history")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  return (data?.chat_history as ChatMessage[] | undefined) ?? [];
}

export async function appendChatMessages(clientId: string, messages: ChatMessage[]): Promise<void> {
  const existing = await getChatHistory(clientId);
  const { error } = await clientsTable()
    .update({ chat_history: [...existing, ...messages] })
    .eq("client_id", clientId);
  if (error) throw error;
}

export async function getTrace(clientId: string): Promise<TraceStep[]> {
  const { data, error } = await clientsTable()
    .select("trace")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  return (data?.trace as TraceStep[] | undefined) ?? [];
}

export async function setTrace(clientId: string, trace: TraceStep[]): Promise<void> {
  const { error } = await clientsTable().update({ trace }).eq("client_id", clientId);
  if (error) throw error;
}

export async function caseloadTotal(): Promise<number> {
  const clients = await listClients();
  return clients.reduce((sum, r) => sum + (r.last_screening?.total_estimated_annual_value ?? 0), 0);
}

export function nextClientId(): string {
  return `c_${randomUUID().slice(0, 8)}`;
}
