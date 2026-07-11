import { screenClient } from "@/lib/engine";
import type { ChatMessage, ClientProfile, ClientRecord, TraceStep } from "@/lib/types";

interface Store {
  clients: Map<string, ClientRecord>;
  chatHistory: Map<string, ChatMessage[]>;
  traces: Map<string, TraceStep[]>;
}

// Module-level in-memory store. Survives across requests within one server
// process (this is a demo app: no auth, no persistence beyond process lifetime,
// per spec §9 "In-memory or SQLite/JSON storage — no auth").
// Stashed on globalThis so Next.js dev-mode hot reload doesn't wipe active sessions.
const globalForStore = globalThis as unknown as { __benefyStore?: Store };

function emptyStore(): Store {
  return { clients: new Map(), chatHistory: new Map(), traces: new Map() };
}

const store = globalForStore.__benefyStore ?? emptyStore();
globalForStore.__benefyStore = store;

export function listClients(): ClientRecord[] {
  return Array.from(store.clients.values());
}

export function getClient(clientId: string): ClientRecord | undefined {
  return store.clients.get(clientId);
}

export function createClient(profile: ClientProfile): ClientRecord {
  const record: ClientRecord = { profile, last_screening: null };
  store.clients.set(profile.client_id, record);
  return record;
}

export function updateProfile(
  clientId: string,
  patch: Partial<ClientProfile>,
): ClientRecord | undefined {
  const record = store.clients.get(clientId);
  if (!record) return undefined;
  record.profile = { ...record.profile, ...patch };
  store.clients.set(clientId, record);
  return record;
}

export function screenAndStore(clientId: string): ClientRecord | undefined {
  const record = store.clients.get(clientId);
  if (!record) return undefined;
  const screening = screenClient(record.profile);
  record.last_screening = screening;
  record.profile = { ...record.profile, last_screened_at: screening.screened_at };
  store.clients.set(clientId, record);
  return record;
}

export function getChatHistory(clientId: string): ChatMessage[] {
  return store.chatHistory.get(clientId) ?? [];
}

export function appendChatMessages(clientId: string, messages: ChatMessage[]): void {
  const existing = store.chatHistory.get(clientId) ?? [];
  store.chatHistory.set(clientId, [...existing, ...messages]);
}

export function getTrace(clientId: string): TraceStep[] {
  return store.traces.get(clientId) ?? [];
}

export function setTrace(clientId: string, trace: TraceStep[]): void {
  store.traces.set(clientId, trace);
}

export function caseloadTotal(): number {
  return listClients().reduce(
    (sum, r) => sum + (r.last_screening?.total_estimated_annual_value ?? 0),
    0,
  );
}

export function nextClientId(): string {
  const n = store.clients.size + 1;
  return `c_${String(n).padStart(3, "0")}`;
}
