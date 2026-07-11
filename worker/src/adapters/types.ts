import type { Page } from "playwright";

export interface HouseholdMemberData {
  full_name: string;
  date_of_birth: string | null;
  relationship: string | null;
  has_income: boolean | null;
  ssn: string | null; // decrypted plaintext, in-memory only — never logged
}

// Decrypted, worker-local shape of everything an adapter might need. Built
// fresh per job in applicantData.ts from the clients table row — SSNs are
// decrypted here and nowhere persisted in this form.
export interface ApplicantProfile {
  display_name: string;
  household_size: number | null;
  member_ages: number[];
  annual_income_gross: number | null;
  monthly_income_gross: number | null;
  zip_code: string | null;
  current_programs: string[];
  legal_name: string | null;
  date_of_birth: string | null;
  street_address: string | null;
  city: string | null;
  mailing_zip_code: string | null;
  phone: string | null;
  email: string | null;
  preferred_language: "en" | "es";
  pge_account_number: string | null;
  sfpuc_account_number: string | null;
  ssn: string | null;
  household_members: HouseholdMemberData[];
}

export interface ApplicantData {
  client_id: string;
  program_id: string;
  profile: ApplicantProfile;
}

export interface ScreenshotArtifact {
  label: string;
  buffer: Buffer;
}

export interface FillOutcome {
  screenshots: ScreenshotArtifact[];
  // Required fields the live form asked for that ApplicantProfile has no
  // data for (e.g. a demographic question we don't collect). Adapters must
  // NEVER fabricate an answer to close this list — a non-empty list here
  // always routes the submission to needs_human instead of awaiting_review
  // or submitted, so a person fills the gap by hand.
  unfillable: string[];
  // Set only when commit=true and the real submit action succeeded.
  receiptNote: string | null;
}

// One adapter per web_submit program. fillAndMaybeSubmit is called twice in
// the lifecycle of a single submission, each time on a *fresh* page/browser
// context (the worker does not hold a browser session open across the
// human review gap, which can be hours):
//   1. commit=false, right after the job is queued — fills the entire form,
//      screenshots every step, and stops before anything irreversible.
//      Result feeds the "awaiting_review" screen.
//   2. commit=true, after the user taps Confirm — re-fills the form from
//      scratch (idempotent) and this time also performs the real submit.
// Adapters must not click a final "Submit"/"Finish" control unless commit
// is true.
export interface WebAdapter {
  kind: "web_submit";
  programId: string;
  verified: boolean; // false = selectors not yet confirmed against the live site; worker refuses commit=true until true
  fillAndMaybeSubmit(page: Page, data: ApplicantData, commit: boolean): Promise<FillOutcome>;
}

export interface PdfFillOutcome {
  pdfBytes: Uint8Array;
  unfillable: string[];
  // Program-specific "what to do with this PDF" note shown to the user on
  // the submitted row. Optional — processPdfJob falls back to a generic
  // "download, sign, submit" line when an adapter doesn't set one.
  receiptNote?: string;
}

export interface PdfAdapter {
  kind: "pdf_fill";
  programId: string;
  verified: boolean;
  fill(data: ApplicantData): Promise<PdfFillOutcome>;
}

export type Adapter = WebAdapter | PdfAdapter;
