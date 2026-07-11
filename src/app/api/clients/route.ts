import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { createClient, listClientsForUser, nextClientId } from "@/lib/store";
import type { ClientProfile } from "@/lib/types";

export async function GET() {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const clients = await listClientsForUser(user.id);
  const caseload_total_annual_value = clients.reduce(
    (sum, r) => sum + (r.last_screening?.total_estimated_annual_value ?? 0),
    0,
  );
  return NextResponse.json({ clients, caseload_total_annual_value });
}

export async function POST(request: Request) {
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
  const record = await createClient(profile, user.id);
  return NextResponse.json({ client: record }, { status: 201 });
}
