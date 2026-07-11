import { describe, expect, it } from "vitest";
import { screenClient } from "@/lib/engine";
import { buildResolutionDelta, buildResolutionQuestion } from "@/lib/gradient/resolutionAgent";
import type { ClientProfile } from "@/lib/types";

function makeProfile(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    client_id: "test",
    display_name: "Test Client",
    household_size: 3,
    monthly_income_gross: 2400,
    annual_income_gross: null,
    member_ages: [34, 8, 5],
    has_senior: false,
    has_disability: false,
    immigration_status: "citizen",
    sf_resident: true,
    zip_code: "94102",
    current_programs: [],
    intake_notes: "",
    field_status: {},
    last_screened_at: null,
    ...overrides,
  };
}

const GUARANTEE_LANGUAGE = [/guaranteed/i, /will receive/i, /approved/i, /you will get/i];

describe("resolution question builder", () => {
  it("asks a targeted immigration question for immigration_status_uncertain", () => {
    const screening = screenClient(makeProfile({ immigration_status: "unknown" }));
    const target = screening.results.find((r) =>
      r.review_triggers.includes("immigration_status_uncertain"),
    );
    expect(target).toBeDefined();
    const q = buildResolutionQuestion(target!);
    expect(q.resolvable).toBe(true);
    expect(q.text).toMatch(/immigration status/i);
  });

  it("marks manual income tests as unresolvable and points at the real application", () => {
    const screening = screenClient(makeProfile({ has_disability: true }));
    const target = screening.results.find((r) =>
      r.review_triggers.includes("income_test_not_modeled"),
    );
    expect(target).toBeDefined();
    const q = buildResolutionQuestion(target!);
    expect(q.resolvable).toBe(false);
    expect(q.text).toMatch(/applying directly/i);
  });

  it("asks for the specific missing field when a required field is absent", () => {
    const screening = screenClient(makeProfile({ has_senior: null, has_disability: null }));
    const target = screening.results.find((r) =>
      r.missing_fields.includes("has_senior_or_has_disability"),
    );
    expect(target).toBeDefined();
    const q = buildResolutionQuestion(target!);
    expect(q.resolvable).toBe(true);
    expect(q.text).toMatch(/senior \(65\+\)/i);
  });

  it("localizes to Spanish", () => {
    const screening = screenClient(makeProfile({ immigration_status: "unknown" }));
    const target = screening.results.find((r) =>
      r.review_triggers.includes("immigration_status_uncertain"),
    )!;
    const q = buildResolutionQuestion(target, "es");
    expect(q.text).toMatch(/estatus migratorio/i);
  });
});

describe("resolution delta builder", () => {
  it("reports a resolved flip to likely_eligible with the engine's dollar value", () => {
    const before = screenClient(makeProfile({ immigration_status: "unknown" }));
    const after = screenClient(makeProfile({ immigration_status: "citizen" }));
    const target = before.results.find(
      (r) =>
        r.review_triggers.includes("immigration_status_uncertain") &&
        after.results.find((a) => a.program_id === r.program_id)?.status === "likely_eligible",
    );
    expect(target).toBeDefined();
    const delta = buildResolutionDelta(before, after, target!.program_id);
    expect(delta.resolved).toBe(true);
    expect(delta.continueResolving).toBe(false);
    expect(delta.text).toMatch(/likely eligible/);
    expect(delta.text).toContain(
      `$${after.total_estimated_annual_value.toLocaleString()}/year`,
    );
  });

  it("mentions other programs flipped by the same answer", () => {
    const before = screenClient(makeProfile({ immigration_status: "unknown" }));
    const after = screenClient(makeProfile({ immigration_status: "citizen" }));
    const flipped = before.results.filter((r) => {
      const a = after.results.find((x) => x.program_id === r.program_id);
      return a != null && a.status !== r.status;
    });
    expect(flipped.length).toBeGreaterThan(1);
    const delta = buildResolutionDelta(before, after, flipped[0].program_id);
    expect(delta.text).toMatch(/also updated/i);
  });

  it("keeps the loop open with a follow-up question when still unresolved", () => {
    const screening = screenClient(makeProfile({ immigration_status: "unknown" }));
    const target = screening.results.find((r) =>
      r.review_triggers.includes("immigration_status_uncertain"),
    )!;
    const delta = buildResolutionDelta(screening, screening, target.program_id);
    expect(delta.resolved).toBe(false);
    expect(delta.continueResolving).toBe(true);
    expect(delta.text).toMatch(/still needs review/);
    expect(delta.text).toMatch(/immigration status/i);
  });

  it("closes the loop when the target lands on an unresolvable manual test", () => {
    const before = screenClient(makeProfile({ has_disability: true }));
    const target = before.results.find((r) =>
      r.review_triggers.includes("income_test_not_modeled"),
    )!;
    const delta = buildResolutionDelta(before, before, target.program_id);
    expect(delta.resolved).toBe(false);
    expect(delta.continueResolving).toBe(false);
  });

  it("never uses guarantee language", () => {
    const before = screenClient(makeProfile({ immigration_status: "unknown" }));
    const after = screenClient(makeProfile({ immigration_status: "citizen" }));
    for (const r of before.results) {
      const delta = buildResolutionDelta(before, after, r.program_id);
      for (const pattern of GUARANTEE_LANGUAGE) {
        expect(delta.text).not.toMatch(pattern);
      }
    }
  });
});
