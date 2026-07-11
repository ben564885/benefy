import type { WebAdapter, FillOutcome } from "./types.js";

// Clipper START — live-walked https://www.clipperstartcard.com/ (APPLY NOW →
// https://www.clipperstartcard.com/s/application) on 2026-07-11 with the
// `browse` skill, filling real test data into every visible field. Left
// `verified: false` — this is a genuine "account creation gates the real
// fields" case per the adapter playbook, not a stub we just haven't gotten
// to. Details:
//
//   - The application is a single Salesforce Experience Cloud (Lightning)
//     page with six accordion sections: Account Information, Profile
//     Information, Mailing Address, Verification Method, Eligibility
//     Documents, Survey — plus a Clipper Contact Agreement (optional) and
//     Clipper Customer Agreement (required) checkbox and a Submit
//     Application button at the bottom.
//   - Only "Account Information" is interactive on page load. Its real
//     fields: textbox "First Name" (name="firstname"), textbox "Last Name"
//     (name="lastname"), textbox "Email" (name="email"), a phone textbox
//     (name="phone") with a Mobile/Home type toggle, a "Send Login code to"
//     Mobile/Email toggle (name="loginPreferenceButtonGroup"), a "Send
//     Application Updates to" Mobile/Email/Both toggle
//     (name="programPreferenceButtonGroup"), and a Language Preference
//     combobox. The toggle "radios" are SLDS button-groups whose native
//     `<input>` isn't a clickable target for Playwright's actionability
//     check (times out) — the real click target is `label[for="<input id>"]`.
//   - Clicking that section's "Save & Continue" submits Account Information
//     and immediately redirects to /s/login/?usm=<email>, a passwordless
//     OTP screen: "Clipper START uses passwordless login... Please check
//     your email for the verification code." The other five accordion
//     sections (Profile Information — DOB, household size, annual income,
//     Clipper Access card, demographics, gender; Mailing Address; Verification
//     Method — CalFresh/Login.gov instant verify OR manual document upload;
//     Eligibility Documents — separate Proof of Identity and Proof of Income
//     uploads; Survey) are NOT reachable before this OTP is entered: clicking
//     their accordion headers directly (without completing Account
//     Information) just highlights the row, it does not expand — confirmed
//     via screenshot. Going "back" to the application page after hitting the
//     OTP screen resets Account Information to blank, i.e. there is no
//     partial-progress path around it.
//   - This is a hard, structural blocker for a headless worker: there is no
//     ApplicantData field or capability for reading a one-time code out of
//     the applicant's real email/SMS inbox, and the field labels this
//     script could see for the locked sections come only from the
//     collapsed-panel DOM dump, never from live interaction (no confirmed
//     dropdown values, no confirmed upload input selector, no confirmed
//     validation behavior) — exactly the "never guess a selector" line this
//     repo won't cross.
//   - Separately, even Account Information alone isn't reliably fillable
//     from what this program's ApplicantProfile is gated to have: submitting
//     it with the phone field blank produced a real "Please provide a phone
//     number." validation error, even though the on-page copy implies email
//     OR mobile is sufficient. `programs.json`'s required_application_fields
//     for clipper_start is ["legal_name", "street_address", "city",
//     "mailing_zip_code", "email"] — no phone, no first/last name split (we
//     only ever have a single `legal_name` string), no date_of_birth. The
//     Eligibility Documents step (Proof of Identity, Proof of Income) has no
//     ApplicantProfile-backed file data at all — required_documents in
//     programs.json is "EBT card, Medi-Cal card, county benefits-eligibility
//     letter, OR most recent federal tax return", none of which we hold as
//     bytes.
//
// Net: this needs either (a) an OTP-relay capability (worker reads a code
// out of the applicant's actual inbox/SMS mid-flow) plus a document-upload
// story, or (b) confirmation from MTC that there's an unauthenticated/API
// path — neither exists today. Until then this routes to needs_human same
// as before; do not flip `verified` without walking past the OTP screen for
// real.
export const clipperStartAdapter: WebAdapter = {
  kind: "web_submit",
  programId: "clipper_start",
  verified: false,

  async fillAndMaybeSubmit(): Promise<FillOutcome> {
    return {
      screenshots: [],
      unfillable: [
        "Clipper START requires passwordless email/SMS OTP account verification " +
          "immediately after the first form section, before Profile Information, " +
          "Mailing Address, Verification Method, or the required Proof of " +
          "Identity/Proof of Income document uploads become reachable — the worker " +
          "has no way to read that one-time code out of the applicant's real inbox.",
      ],
      receiptNote: null,
    };
  },
};
