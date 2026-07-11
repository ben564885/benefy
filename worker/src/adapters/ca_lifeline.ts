import type { WebAdapter, FillOutcome } from "./types.js";

// California LifeLine — attempted live walkthrough of https://www.californialifeline.com
// on 2026-07-11 via the `browse` skill (both headless and headed/stealth
// Chromium, five separate navigation attempts across `/`, `/en/login`, and
// `/en/account/register`) and independently via the WebFetch tool (a
// different fetch stack entirely). Every attempt returned the same result:
// a Cloudflare "Sorry, you have been blocked" hard block (Cloudflare error
// 1020 — a bot-management deny rule, not a solvable JS/managed challenge;
// there is no "wait it out" or "click through" path past this screen). The
// site's own server-rendered HTML was never reached, so there are no real
// selectors to cite here — writing any Playwright locators for this form
// right now would mean guessing, which is exactly what we're required not
// to do.
//
// Independent research (search-engine results, the official PDF paper
// application at https://www.californialifeline.com/assets/pdf/English/EN_App.pdf,
// and the CPUC's own LifeLine eligibility page) confirms this adapter would
// likely not be a clean single-form automation even if the Cloudflare block
// were lifted:
//   - The paper application's own cover page reads "Apply faster online at
//     [url] using your PIN" — the online portal is a PIN-gated account
//     flow, not a blank intake form. The PIN is issued by mail by the
//     California LifeLine Administrator (or generated once a participating
//     carrier submits an enrollment on the consumer's behalf) — Benefy's
//     ApplicantProfile has no such PIN and no way to obtain one
//     out-of-band.
//   - The site's login page (`/en/login`, titled "Customer Registration")
//     and `/en/account/register` (titled "Registration Step 1 of 3: Find My
//     Account") both point to an account-lookup flow, not a fresh-apply
//     form: step 1 of 3 is "find" an existing account, implying the
//     consumer (or their carrier) must already have a record in the state's
//     system.
//   - The CPUC's eligibility page describes the online portal at
//     californialifeline.com as being for *renewals* ("consumers can simply
//     go online to renew"), while framing *new* applicants as going through
//     "a phone company" for approval — i.e. new enrollment is carrier-
//     initiated (the participating landline/mobile/broadband carrier the
//     household signs up with submits the LifeLine enrollment on the
//     state's back end), not something a consumer fills out cold on
//     californialifeline.com.
//
// Net: this does not look like a single unified web form californialifeline.com
// hosts end-to-end for new applicants — it looks like a carrier-signup flow
// (pick a participating carrier, enroll in service with them, they submit
// the LifeLine enrollment) with californialifeline.com itself serving PIN-
// gated renewal/account-management for people already in the system. That
// matches the "routes through a carrier's own signup flow" case this
// adapter was flagged for. Between the confirmed hard Cloudflare block (we
// cannot even see real markup to verify selectors) and the PIN-gated shape
// of the flow, this stays unverified. Re-attempt only if californialifeline.com's
// bot-protection allowlists the worker's egress IP, and even then expect to
// find a carrier-selection step rather than a single fillable form — that
// may mean this program stays `assisted` rather than `web_submit` long-term.
export const caLifelineAdapter: WebAdapter = {
  kind: "web_submit",
  programId: "ca_lifeline",
  verified: false,

  async fillAndMaybeSubmit(): Promise<FillOutcome> {
    return {
      screenshots: [],
      unfillable: [
        "California LifeLine automation not yet verified: californialifeline.com returns a hard Cloudflare block " +
          "(error 1020) to both headless and headed automated browsers as well as plain HTTP fetches, so no real " +
          "form markup could be observed. Independent research also indicates new enrollment is PIN-gated and " +
          "likely carrier-initiated rather than a single self-serve online form — see doc comment for details.",
      ],
      receiptNote: null,
    };
  },
};
