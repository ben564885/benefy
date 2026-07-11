import { NextResponse } from "next/server";
import { getChatHistory, getClient, getTrace } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const record = getClient(id);
  if (!record) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  return NextResponse.json({
    client: record,
    chat_history: getChatHistory(id),
    trace: getTrace(id),
  });
}
