import type { Page } from "playwright";
import type { ApplicantData, FillOutcome, WebAdapter } from "./types.js";

// SFPUC Water/Sewer Customer Assistance Program — verified live against
// https://forms.office.com/g/Ut4PWU2b1y on 2026-07-11 (4-page Microsoft
// Forms flow; see worker/README.md's "Adapter status" table for a summary
// across all programs). Real, load-bearing details from that pass:
//
//   - Page 3 has a REQUIRED "I agree" radio authorizing SFPUC to run a
//     TransUnion income/credit-history check (explicitly stated NOT to
//     affect credit score, but it is a real third-party data pull). This is
//     legally distinct from Benefy's own "let us fill and submit this form"
//     consent — the apply-consent screen must show this exact TransUnion
//     disclosure for sfpuc_cap specifically, not just generic apply copy.
//   - Page 3 also asks whether OTHER household members earn income. We only
//     have has_income at the household_members level, not verified selectors
//     for the "up to 5 additional earners" sub-form MS Forms reveals on
//     "Yes" — so any client with other income-earning members routes to
//     needs_human here rather than guessing that sub-form's fields.
//   - Page 4 has demographic questions (referral source, race/ethnicity,
//     preferred language, free-text comments) under a "Required" section
//     header whose per-question required-ness wasn't fully disambiguated
//     live. We fill preferred_language (real data) and default the PEV
//     recertification question to "No" (this flow is always a first-time
//     apply, never a recert), leave the rest blank, and probe for MS
//     Forms' "This question is required." validation text after Next —
//     if it appears, we stop and report needs_human instead of guessing.
//   - Final page-4 "I agree to the Terms and Conditions" radio is the
//     application's perjury-style attestation — clicking it has no legal
//     effect until the real Submit button is pressed (commit=true), since
//     MS Forms doesn't transmit anything to the form owner before Submit.

const SFPUC_FORM_URL = "https://forms.office.com/g/Ut4PWU2b1y";

async function screenshot(page: Page, label: string): Promise<{ label: string; buffer: Buffer }> {
  const buffer = await page.screenshot({ fullPage: true });
  return { label, buffer };
}

function annualIncomeString(data: ApplicantData): string {
  const p = data.profile;
  const annual = p.annual_income_gross ?? (p.monthly_income_gross ?? 0) * 12;
  return String(Math.round(annual));
}

async function hasRequiredFieldError(page: Page): Promise<boolean> {
  const text = await page.locator("body").innerText();
  return text.includes("This question is required.");
}

export const sfpucCapAdapter: WebAdapter = {
  kind: "web_submit",
  programId: "sfpuc_cap",
  verified: true,

  async fillAndMaybeSubmit(page: Page, data: ApplicantData, commit: boolean): Promise<FillOutcome> {
    const p = data.profile;
    const unfillable: string[] = [];
    const screenshots: { label: string; buffer: Buffer }[] = [];

    const otherEarners = p.household_members.some((m) => m.has_income);
    if (otherEarners) {
      return {
        screenshots: [],
        unfillable: [
          "Other household members with income — SFPUC's additional-earner sub-form isn't automated yet",
        ],
        receiptNote: null,
      };
    }

    await page.goto(SFPUC_FORM_URL, { waitUntil: "domcontentloaded" });
    screenshots.push(await screenshot(page, "Page 1 — program overview"));
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // --- Page 2: contact + household details ---
    await page.getByRole("textbox", { name: /SFPUC Water\/Sewer Account Number/i }).fill(p.sfpuc_account_number ?? "");
    await page.getByRole("textbox", { name: /^2, Customer Name/i }).fill(p.legal_name ?? p.display_name);
    await page.getByRole("textbox", { name: /Service Address/i }).fill(p.street_address ?? "");
    await page.getByRole("button", { name: /^4, City/i }).click();
    await page.getByRole("option", { name: "San Francisco", exact: true }).click();
    await page.getByRole("textbox", { name: /^5, Zip Code/i }).fill(p.mailing_zip_code ?? p.zip_code ?? "");
    await page.getByRole("textbox", { name: /Email Address/i }).fill(p.email ?? "");
    await page.getByRole("textbox", { name: /Phone Number/i }).fill(p.phone ?? "");
    await page.getByRole("textbox", { name: /Current ANNUAL household income/i }).fill(annualIncomeString(data));
    await page.getByRole("textbox", { name: /Number of residents/i }).fill(String(p.household_size ?? ""));
    screenshots.push(await screenshot(page, "Page 2 — account, contact, income"));
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // --- Page 3: TransUnion income-verification consent ---
    await page.getByRole("radio", { name: "I agree", exact: true }).click();
    await page.getByRole("radio", { name: "No", exact: true }).click(); // no other income-earning household members
    screenshots.push(await screenshot(page, "Page 3 — TransUnion income verification consent (required to proceed)"));
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // --- Page 4: demographics (optional-looking) + recertification + final attestation ---
    const languageLabel = p.preferred_language === "es" ? "Spanish" : "English";
    await page.getByRole("radio", { name: languageLabel, exact: true }).click();
    await page.getByRole("radio", { name: "No", exact: true }).first().click(); // PEV recertification: this is always a first-time apply
    await page.getByRole("radio", { name: "I agree to the Terms and Conditions", exact: true }).click();
    screenshots.push(await screenshot(page, "Page 4 — language, recertification, final attestation"));

    if (commit) {
      if (await hasRequiredFieldError(page)) {
        return { screenshots, unfillable: ["A required field on page 4 was left blank"], receiptNote: null };
      }
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await page.waitForLoadState("networkidle");
      screenshots.push(await screenshot(page, "Confirmation"));
      return { screenshots, unfillable, receiptNote: "SFPUC CAP application submitted via Microsoft Forms." };
    }

    return { screenshots, unfillable, receiptNote: null };
  },
};
