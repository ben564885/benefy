import { describe, expect, it } from "vitest";
import { runEvals } from "@/lib/gradient/evals";

describe("Gradient agent evaluation set", () => {
  it("passes every case, including the never-asserts-eligibility guardrail check", async () => {
    const summary = await runEvals();
    if (summary.failed > 0) {
      console.error(JSON.stringify(summary.results.filter((r) => !r.passed), null, 2));
    }
    expect(summary.never_asserts_eligibility_check).toBe("passed");
    expect(summary.failed).toBe(0);
    expect(summary.passed).toBe(summary.total);
  });
});
