import { NextResponse } from "next/server";
import { requireOwnedClient } from "@/lib/auth";
import { getChatHistory, getTrace } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const owned = await requireOwnedClient(id);
  if (!owned.ok) {
    const message = owned.status === 401 ? "Not authenticated" : "Client not found";
    return NextResponse.json({ error: message }, { status: owned.status === 403 ? 404 : owned.status });
  }
  return NextResponse.json({
    client: owned.record,
    chat_history: await getChatHistory(id),
    trace: await getTrace(id),
  });
}
