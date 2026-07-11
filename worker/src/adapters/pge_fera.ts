import type { Page } from "playwright";
import type { ApplicantData, ApplicantProfile, FillOutcome, WebAdapter } from "./types.js";

// PG&E CARE/FERA combined online application — live-walked with the `browse`
// skill against https://energyinsight.pge.com/carefera?care_lang=english on
// 2026-07-11. Real, load-bearing findings from that pass:
//
//   - The whole form is a single Salesforce Experience Cloud Lightning Web
//     Component (`<c-care_flatsitelandingpage>`) rendered inside an OPEN
//     shadow DOM. Plain Playwright CSS locators (`page.locator('#id')`)
//     pierce it fine — confirmed live by filling every field below through
//     the shadow root. Most `<label>` text nodes are NOT `for`-associated
//     with their input (only the radio-button labels are), so
//     `getByLabel`/`getByRole` name matching is unreliable here; the real
//     element `id`s captured below are what actually work.
//   - There is exactly ONE page of data entry ("Account Information"):
//     account number (10-digit, id `accnumberinput-0`), customer name in
//     "Last,First" order per its own placeholder (id `custnameinput-0`),
//     address line 1/2, city, state (fixed text "California", not an
//     input), ZIP, language preference (dropdown: Choose
//     One/Cantonese/English/Hmong/Korean/Mandarin/Russian/Spanish/Tagalog/
//     Vietnamese), preferred communication method (Mail/Email/Phone/Text
//     radios — none of these contact fields are marked required), number
//     of adults / number of children in household (two REQUIRED dropdowns,
//     0-20 or 1-20), and a REQUIRED "CARE/FERA Qualification Option" radio
//     (Annual Household Income vs. Public Assistance Program) — picking
//     "Annual Household Income" reveals a REQUIRED "Annual Household
//     Income" text field plus an optional "I am currently on a fixed
//     income" checkbox. A final "Is a Community Outreach Contractor
//     helping you fill out this form?" Yes/No toggle is NOT required and,
//     left untouched, the review page echoes it back as "No" by default —
//     confirmed live, so this adapter does not touch that control at all
//     rather than guess a "No" radio id it never inspected.
//   - Clicking "NEXT >" (the only <button> on the page) advances to a
//     client-side "Confirmation" review screen that echoes back language,
//     comm method, household counts, qualification option + income,
//     email, and "Enrollment Assisted". This transition is NOT a
//     submission — it's a same-page Lightning re-render (URL never
//     changes), directly analogous to sfpuc_cap's page-to-page Next
//     clicks, so it's done unconditionally (both commit=false/true).
//   - Could NOT confirm what the Confirmation page's own "NEXT >" button
//     does. A full recursive text dump of the entire shadow DOM at that
//     screen (see research notes) contains no "certify" / "perjury" /
//     "attest" / "signature" / "terms" / "submit" text anywhere — unusual
//     for a utility assistance application, and it left real doubt about
//     whether this second "NEXT >" is the true final submit or whether
//     PG&E's flow has a further attestation/thank-you step this
//     walkthrough never reached. Per the hard safety rule, it was never
//     clicked live. This adapter clicks it ONLY when commit=true (so the
//     code is ready), but `verified` stays `false` until a human runs a
//     real commit=true pass end-to-end and confirms (a) that click is
//     genuinely terminal and (b) what the resulting page looks like.
//   - Practical note for whoever re-runs this walkthrough: the shared
//     `browse` daemon on this box appeared to be used concurrently by
//     other agent sessions mid-walkthrough — tabs kept getting silently
//     re-navigated to unrelated sites (caliheapapply.com,
//     clipperstartcard.com, californialifeline.com — all other pending
//     worker adapters in this same repo). Every finding above was
//     re-confirmed on a freshly isolated tab before being trusted here.

const PGE_FERA_URL = "https://energyinsight.pge.com/carefera?care_lang=english";

async function screenshot(page: Page, label: string): Promise<{ label: string; buffer: Buffer }> {
  const buffer = await page.screenshot({ fullPage: true });
  return { label, buffer };
}

function digitsOnly(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

// The form wants "Last,First" (see its own "e.g. Smith,John" placeholder).
// We only ever store one legal_name string, so this is a real-data
// reformat, not an invented value: last whitespace-separated token becomes
// the surname, everything before it becomes the given name(s). A
// single-word name is passed through unchanged (nothing to reorder).
function formatCustomerName(legalName: string): string {
  const parts = legalName.trim().split(/\s+/);
  if (parts.length < 2) return legalName.trim();
  const last = parts.pop() as string;
  return `${last},${parts.join(" ")}`;
}

function householdCounts(p: ApplicantProfile): { adults: number; children: number } | null {
  if (p.household_size == null) return null;
  const children = p.member_ages.filter((a) => a != null && a < 18).length;
  const adults = Math.max(p.household_size - children, 1);
  return { adults, children };
}

function annualIncomeString(p: ApplicantProfile): string | null {
  const annual = p.annual_income_gross ?? (p.monthly_income_gross != null ? p.monthly_income_gross * 12 : null);
  return annual != null ? String(Math.round(annual)) : null;
}

export const pgeFeraAdapter: WebAdapter = {
  kind: "web_submit",
  programId: "pge_fera",
  verified: false, // see doc comment above — everything through the Confirmation review page is real and live-verified; the review page's own final "NEXT >" was never clicked live and its effect is unconfirmed.

  async fillAndMaybeSubmit(page: Page, data: ApplicantData, commit: boolean): Promise<FillOutcome> {
    const p = data.profile;
    const unfillable: string[] = [];
    const screenshots: { label: string; buffer: Buffer }[] = [];

    const accountNumber = digitsOnly(p.pge_account_number)?.slice(0, 10) ?? null;
    if (!accountNumber) unfillable.push("PG&E Account Number");

    const legalName = p.legal_name ?? p.display_name;
    if (!legalName) unfillable.push("Customer Name");

    if (!p.street_address) unfillable.push("Address (Line 1)");
    if (!p.city) unfillable.push("City");
    const zip = p.mailing_zip_code ?? p.zip_code;
    if (!zip) unfillable.push("ZIP Code");

    const counts = householdCounts(p);
    if (!counts) {
      unfillable.push("Number of adults in household", "Number of children in household");
    }

    const income = annualIncomeString(p);
    if (!income) unfillable.push("Annual Household Income");

    await page.goto(PGE_FERA_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    // Cookie consent banner (OneTrust) sits on top of the form on first load.
    const rejectCookies = page.getByRole("button", { name: "Reject Non-Necessary Cookies", exact: true });
    if (await rejectCookies.isVisible().catch(() => false)) {
      await rejectCookies.click();
    }

    if (accountNumber) await page.locator("#accnumberinput-0").fill(accountNumber);
    if (legalName) await page.locator("#custnameinput-0").fill(formatCustomerName(legalName));
    if (p.street_address) await page.locator("#addrline1input-0").fill(p.street_address);
    if (p.city) await page.locator("#cityinput-0").fill(p.city);
    if (zip) await page.locator("#postcodeinput-0").fill(zip);

    await page.locator("#langid-0").selectOption({ label: p.preferred_language === "es" ? "Spanish" : "English" });

    // Preferred contact method + phone type aren't marked required by the
    // live form, but we do have real email/phone data, so we supply it:
    // Email is picked because email is guaranteed present for this program
    // (see required_application_fields in programs.json); "Mobile" is the
    // most reasonable default classification for an individual applicant's
    // personal number (this program has no work/business contact), not a
    // claim about data we don't have.
    if (p.email) {
      await page.locator('label[for="Email-0"]').click();
      await page.locator("#emailinput-0").fill(p.email);
      await page.locator("#confrmemailinput-0").fill(p.email);
    }
    if (p.phone) {
      await page.locator('label[for="Mobile-0"]').click();
      await page.locator("#mainphonenuminput-0").fill(p.phone);
    }

    if (counts) {
      await page.locator("#adultscountselector-0").selectOption(String(counts.adults));
      await page.locator("#childrencountselector-0").selectOption(String(counts.children));
    }

    if (income) {
      // "Annual Household Income" is how Benefy's own screener determines
      // FERA eligibility, so that's the qualification option we select
      // (the alternative, "Public Assistance Program", asserts categorical
      // enrollment in a specific program we don't verify here).
      await page.locator('label[for="Annual-0"]').click();
      await page.locator("#annualincomeselector-0").fill(income);
    }

    // "Is a Community Outreach Contractor helping you fill out this form?"
    // is left untouched deliberately — confirmed live that doing nothing
    // here makes the review page report "Enrollment Assisted: No", which
    // is factually correct (Benefy is not a registered CBO), without
    // needing to guess the "No" radio's id.

    screenshots.push(await screenshot(page, "Account Information — page 1"));

    if (unfillable.length > 0) {
      return { screenshots, unfillable, receiptNote: null };
    }

    const nextButton = page.getByRole("button", { name: /NEXT/i });
    await nextButton.click();
    await page.waitForLoadState("networkidle");
    screenshots.push(await screenshot(page, "Confirmation — review screen"));

    if (commit) {
      // Unconfirmed live — see doc comment. Only reachable once a human
      // flips `verified` to true after confirming this really is terminal.
      const confirmNext = page.getByRole("button", { name: /^NEXT/i });
      await confirmNext.click();
      await page.waitForLoadState("networkidle");
      screenshots.push(await screenshot(page, "After Confirmation NEXT (unconfirmed step)"));
      return {
        screenshots,
        unfillable,
        receiptNote: "PG&E CARE/FERA form submitted past the Confirmation review step.",
      };
    }

    return { screenshots, unfillable, receiptNote: null };
  },
};
