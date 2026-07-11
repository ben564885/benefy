import { NextResponse } from "next/server";
import { caseloadTotal, createClient, listClients, nextClientId } from "@/lib/store";
import type { ClientProfile } from "@/lib/types";

export async function GET() {
  const clients = await listClients();
  return NextResponse.json({
    clients,
    caseload_total_annual_value: await caseloadTotal(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clientId = nextClientId();
  const profile: ClientProfile = {
    client_id: clientId,
    display_name: body.display_name || "You",
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
  };
  const record = await createClient(profile);
  return NextResponse.json({ client: record }, { status: 201 });
}
