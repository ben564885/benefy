import type { ClientProfile } from "@/lib/types";

function fullyCaptured(fields: string[]): Record<string, "captured"> {
  return Object.fromEntries(fields.map((f) => [f, "captured" as const]));
}

const CORE_FIELDS = [
  "household_size",
  "monthly_income_gross",
  "sf_resident",
  "immigration_status",
  "has_senior",
  "has_disability",
];

export const SEED_CLIENTS: ClientProfile[] = [
  {
    client_id: "c_001",
    display_name: "Maria G.",
    household_size: 3,
    monthly_income_gross: 2504,
    annual_income_gross: null,
    member_ages: [32, 8, 5],
    has_senior: false,
    has_disability: false,
    immigration_status: "citizen",
    sf_resident: true,
    zip_code: "94102",
    current_programs: ["Medi-Cal"],
    intake_notes:
      "Single mom, two kids (8 and 5). Works part-time retail, about $2,500/month gross. Already on Medi-Cal. Lives in the Tenderloin.",
    field_status: fullyCaptured(CORE_FIELDS),
    last_screened_at: null,
  },
  {
    client_id: "c_002",
    display_name: "Robert T.",
    household_size: 1,
    monthly_income_gross: 1167,
    annual_income_gross: null,
    member_ages: [68],
    has_senior: true,
    has_disability: false,
    immigration_status: "citizen",
    sf_resident: true,
    zip_code: "94110",
    current_programs: [],
    intake_notes:
      "68-year-old retired veteran, lives alone in the Mission. Social Security is his only income, about $14,000/year. Not enrolled in any other programs yet.",
    field_status: fullyCaptured(CORE_FIELDS),
    last_screened_at: null,
  },
  {
    client_id: "c_003",
    display_name: "Client (pending verification)",
    household_size: 2,
    monthly_income_gross: 3658,
    annual_income_gross: null,
    member_ages: [29, 4],
    has_senior: false,
    has_disability: false,
    immigration_status: "unknown",
    sf_resident: true,
    zip_code: "94112",
    current_programs: [],
    intake_notes:
      "Parent and one child. Income is right around $43,900/year — caseworker isn't sure if it's gross or net yet. Client mentioned visa paperwork is 'in process' but didn't specify status clearly, so immigration status needs follow-up before screening further.",
    field_status: fullyCaptured(CORE_FIELDS),
    last_screened_at: null,
  },
  {
    client_id: "c_004",
    display_name: "James W.",
    household_size: 2,
    monthly_income_gross: 4833,
    annual_income_gross: null,
    member_ages: [45, 16],
    has_senior: false,
    has_disability: true,
    immigration_status: "citizen",
    sf_resident: true,
    zip_code: "94124",
    current_programs: [],
    intake_notes:
      "Household of 2 (client + teenage dependent). Client has a documented disability and receives SSDI plus part-time contract income, combined about $58,000/year household gross — too high for CalFresh, but worth checking the disability-linked SF programs.",
    field_status: fullyCaptured(CORE_FIELDS),
    last_screened_at: null,
  },
  {
    client_id: "c_005",
    display_name: "Angela P.",
    household_size: 1,
    monthly_income_gross: 1833,
    annual_income_gross: null,
    member_ages: [52],
    has_senior: false,
    has_disability: true,
    immigration_status: "citizen",
    sf_resident: true,
    zip_code: "94103",
    current_programs: ["SSI"],
    intake_notes:
      "52-year-old, receives SSI due to a qualifying disability. Lives alone in SoMa. Hasn't been screened for CalFresh or utility assistance before — assumed she 'already gets everything' from SSI.",
    field_status: fullyCaptured(CORE_FIELDS),
    last_screened_at: null,
  },
];
