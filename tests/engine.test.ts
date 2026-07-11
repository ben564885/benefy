import { describe, expect, it } from "vitest";
import { evaluate, screenClient } from "@/lib/engine";
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

describe("deterministic eligibility engine", () => {
  it("is a pure function: same input always yields same output", () => {
    const profile = makeProfile();
    const a = evaluate(profile);
    const b = evaluate(profile);
    expect(a).toEqual(b);
  });

  it("flags needs_review when a required field is missing", () => {
    const profile = makeProfile({ sf_resident: null });
    const [calfresh] = evaluate(profile);
    expect(calfresh.status).toBe("needs_review");
    expect(calfresh.missing_fields).toContain("sf_resident");
    expect(calfresh.review_triggers).toContain("missing_required_field");
  });

  it("flags needs_review on unknown immigration status for immigration-sensitive programs, never asserting eligibility", () => {
    const profile = makeProfile({ immigration_status: "unknown" });
    const results = evaluate(profile);
    const calfresh = results.find((r) => r.program_id === "calfresh")!;
    expect(calfresh.status).toBe("needs_review");
    expect(calfresh.review_triggers).toContain("immigration_status_uncertain");
    // PG&E CARE is not immigration-sensitive, so it should still be evaluated normally.
    const care = results.find((r) => r.program_id === "pge_care")!;
    expect(care.status).not.toBe("needs_review");
  });

  it("flags needs_review for borderline income near a threshold", () => {
    // CalFresh cutoff is 200% FPL. For household size 3 (FPL $27,320), 200% = $54,640.
    // $53,500/yr ≈ 195.7% FPL — inside the ±5-point borderline band.
    const profile = makeProfile({
      household_size: 3,
      monthly_income_gross: null,
      annual_income_gross: 53500,
    });
    const [calfresh] = evaluate(profile);
    expect(calfresh.status).toBe("needs_review");
    expect(calfresh.review_triggers).toContain("borderline_income");
  });

  it("grants categorical eligibility for CalFresh when client is on Medi-Cal, regardless of income band", () => {
    const profile = makeProfile({
      annual_income_gross: 200000,
      monthly_income_gross: null,
      current_programs: ["Medi-Cal"],
    });
    const [calfresh] = evaluate(profile);
    expect(calfresh.status).toBe("likely_eligible");
    expect(calfresh.confidence).toBe(0.95);
    expect(calfresh.estimated_annual_value).toBeGreaterThan(0);
  });

  it("marks clearly-over-income households as likely_ineligible, not needs_review", () => {
    const profile = makeProfile({
      household_size: 3,
      monthly_income_gross: null,
      annual_income_gross: 90000,
    });
    const [calfresh] = evaluate(profile);
    expect(calfresh.status).toBe("likely_ineligible");
  });

  it("marks clearly-under-income households as likely_eligible with a positive value estimate", () => {
    const profile = makeProfile({
      household_size: 3,
      monthly_income_gross: 2400,
    });
    const [calfresh] = evaluate(profile);
    expect(calfresh.status).toBe("likely_eligible");
    expect(calfresh.estimated_annual_value).toBeGreaterThan(0);
  });

  it("gates SFMTA Free Muni on SF residency", () => {
    const profile = makeProfile({
      sf_resident: false,
      has_senior: true,
      member_ages: [70],
      household_size: 1,
      monthly_income_gross: 1200,
    });
    const results = evaluate(profile);
    const muni = results.find((r) => r.program_id === "sfmta_free_muni")!;
    expect(muni.status).toBe("likely_ineligible");
    expect(muni.reason).toMatch(/San Francisco residency/);
  });

  it("gates SFMTA Free Muni on senior-or-disabled status", () => {
    const profile = makeProfile({
      sf_resident: true,
      has_senior: false,
      has_disability: false,
      member_ages: [34],
      household_size: 1,
      monthly_income_gross: 1200,
    });
    const results = evaluate(profile);
    const muni = results.find((r) => r.program_id === "sfmta_free_muni")!;
    expect(muni.status).toBe("likely_ineligible");
    expect(muni.reason).toMatch(/senior|disability/);
  });

  it("qualifies a low-income SF senior for Free Muni", () => {
    const profile = makeProfile({
      sf_resident: true,
      has_senior: true,
      member_ages: [70],
      household_size: 1,
      monthly_income_gross: 1500,
    });
    const results = evaluate(profile);
    const muni = results.find((r) => r.program_id === "sfmta_free_muni")!;
    expect(muni.status).toBe("likely_eligible");
    expect(muni.estimated_annual_value).toBe(1032);
  });

  it("excludes needs_review programs from the savings total but surfaces them as potential additional value", () => {
    const profile = makeProfile({ immigration_status: "unknown" });
    const screening = screenClient(profile);
    const needsReviewIds = screening.results
      .filter((r) => r.status === "needs_review")
      .map((r) => r.program_id);
    expect(needsReviewIds.length).toBeGreaterThan(0);
    expect(screening.potential_additional_value).toBeGreaterThan(0);
    // Total should only sum likely_eligible values.
    const expectedTotal = screening.results
      .filter((r) => r.status === "likely_eligible")
      .reduce((s, r) => s + r.estimated_annual_value, 0);
    expect(screening.total_estimated_annual_value).toBe(expectedTotal);
  });

  it("never returns a status other than the three defined outcomes", () => {
    const profile = makeProfile();
    const results = evaluate(profile);
    for (const r of results) {
      expect(["likely_eligible", "likely_ineligible", "needs_review"]).toContain(r.status);
    }
  });

  it("always resolves 'manual' income tests to needs_review, never a guessed eligible/ineligible", () => {
    // SSI/SSP: manual income test, plausible senior/citizen profile with no categorical hit.
    const profile = makeProfile({ has_senior: true, member_ages: [70, 8, 5], monthly_income_gross: 900 });
    const results = evaluate(profile);
    const ssi = results.find((r) => r.program_id === "ssi_ssp")!;
    expect(ssi.status).toBe("needs_review");
    expect(ssi.review_triggers).toContain("income_test_not_modeled");
  });

  it("still hard-gates a 'manual' income test program on senior/disability status", () => {
    const profile = makeProfile({ has_senior: false, has_disability: false });
    const results = evaluate(profile);
    const ssi = results.find((r) => r.program_id === "ssi_ssp")!;
    expect(ssi.status).toBe("likely_ineligible");
  });

  it("grants a 'none' income test program (Clipper Access) once the disability gate is met, with no income question", () => {
    const profile = makeProfile({ has_disability: true, monthly_income_gross: 50000 });
    const results = evaluate(profile);
    const rtc = results.find((r) => r.program_id === "clipper_access_rtc")!;
    expect(rtc.status).toBe("likely_eligible");
    expect(rtc.income_pct_fpl).toBeNull();
  });

  it("evaluates PG&E FERA against its own dollar table, not the FPL table", () => {
    // Household of 3, FERA limit is $68,300 — well under. CalFresh's 200% FPL for HH3 is $54,640, so
    // this income would fail CalFresh but should pass FERA, proving the two use different bases.
    const profile = makeProfile({ household_size: 3, monthly_income_gross: null, annual_income_gross: 60000 });
    const results = evaluate(profile);
    const calfresh = results.find((r) => r.program_id === "calfresh")!;
    const fera = results.find((r) => r.program_id === "pge_fera")!;
    expect(calfresh.status).toBe("likely_ineligible");
    expect(fera.status).toBe("likely_eligible");
  });

  it("restricts CAPI to noncitizens via immigration_required, hard-gating citizens to likely_ineligible", () => {
    const profile = makeProfile({ immigration_status: "citizen", has_senior: true, member_ages: [70] });
    const results = evaluate(profile);
    const capi = results.find((r) => r.program_id === "capi")!;
    expect(capi.status).toBe("likely_ineligible");
    expect(capi.reason).toMatch(/restricted to specific immigration statuses/);
  });

  it("lets a qualifying noncitizen continue past the CAPI immigration_required gate", () => {
    const profile = makeProfile({ immigration_status: "lpr", has_senior: true, member_ages: [70] });
    const results = evaluate(profile);
    const capi = results.find((r) => r.program_id === "capi")!;
    // Manual income test still applies, so this resolves to needs_review — the point is it's NOT
    // hard-gated to likely_ineligible the way a citizen profile is.
    expect(capi.status).toBe("needs_review");
  });
});
