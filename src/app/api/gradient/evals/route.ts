import { NextResponse } from "next/server";
import { runEvals } from "@/lib/gradient/evals";

export async function GET() {
  const summary = await runEvals();
  return NextResponse.json(summary);
}
