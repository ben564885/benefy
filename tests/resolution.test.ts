import { describe, expect, it } from "vitest";
import { screenClient } from "@/lib/engine";
import {
  buildResolutionDelta,
  buildResolutionQuestion,
  buildResolveAllOpening,
  nextResolvableTarget,
} from "@/lib/gradient/resolutionAgent";
import { routeTurn } from "@/lib/gradient/router";
import { EMPTY_APPLICATION_PROFILE } from "@/lib/types";
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
    is_veteran: null,
    immigration_status: "citizen",
    sf_resident: true,
    zip_code: "94102",
    current_programs: [],
    intake_notes: "",
    field_status: {},
    last_screened_at: null,
    application_profile: EMPTY_APPLICATION_PROFILE,
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

  it("routes resolve-intent messages to the resolution loop, not the model", () => {
    expect(routeTurn("ask me all the questions to resolve the unresolved", true, 3)).toBe("resolve");
    expect(routeTurn("let's finish the screening questions", true, 2)).toBe("resolve");
    // No needs-review items → nothing to resolve, normal routing applies.
    expect(routeTurn("ask me all the questions to resolve the unresolved", true, 0)).toBe("intake");
    // No screening yet → intake.
    expect(routeTurn("resolve everything", false, 0)).toBe("intake");
    // Navigator questions still route to the navigator.
    expect(routeTurn("why am I not eligible for CalFresh?", true, 0)).toBe("navigator");
  });

  it("opens resolve-all with a count preamble and the first resolvable question", () => {
    const screening = screenClient(makeProfile({ immigration_status: "unknown" }));
    const opening = buildResolveAllOpening(screening);
    expect(opening.target).not.toBeNull();
    expect(opening.target!.status).toBe("needs_review");
    expect(opening.text).toContain(`${screening.needs_review_count} program(s) need review`);
    expect(opening.text).toMatch(/immigration status/i);
  });

  it("chains to the next resolvable target, skipping manual income tests", () => {
    const screening = screenClient(makeProfile({ immigration_status: "unknown", has_disability: true }));
    const first = nextResolvableTarget(screening)!;
    expect(first.status).toBe("needs_review");
    expect(buildResolutionQuestion(first).resolvable).toBe(true);
    const second = nextResolvableTarget(screening, first.program_id);
    if (second) {
      expect(second.program_id).not.toBe(first.program_id);
      expect(buildResolutionQuestion(second).resolvable).toBe(true);
    }
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
