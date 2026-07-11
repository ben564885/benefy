import { NextResponse } from "next/server";
import { getAllPrograms } from "@/lib/engine";

export async function GET() {
  return NextResponse.json({ programs: getAllPrograms() });
}
