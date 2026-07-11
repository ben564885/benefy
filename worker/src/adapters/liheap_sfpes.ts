import type { WebAdapter, FillOutcome } from "./types.js";

// STUB — walked live against https://www.caliheapapply.com/ on 2026-07-11
// with the `browse` skill. BLOCKED before reaching any application field —
// this cannot be automated as an anonymous fill-and-submit flow. Findings:
//
//   - The landing page (https://www.caliheapapply.com/) is a gate, not a
//     form: it presents exactly two paths, "New Users: Register account"
//     and "Returning Users: Secure Login". There is no anonymous/guest
//     apply path — the application itself lives behind auth.
//   - "Register account" goes to
//     https://www.caliheapapply.com/Identity/Account/Register, which is
//     the default scaffolded ASP.NET Core Identity registration UI (route
//     literally `/Identity/Account/Register`). The form asks for: First
//     Name, Last Name, County* (combobox), City* (combobox, disabled until
//     County is chosen), Zip Code* (combobox, disabled until City is
//     chosen), Username* (8-15 chars), Email Address* — the field's own
//     label reads "required for verification and account recovery" —,
//     Confirm Email Address*, Preferred Language* (combobox), Password*,
//     Confirm your password, and an "I agree to the terms & conditions"
//     checkbox, then "Submit Registration".
//   - ASP.NET Core Identity's default scaffolded flow (which this route
//     naming matches exactly) requires a confirmed email address before
//     the account can log in — a real inbox click-through this worker has
//     no way to perform headlessly, and there is no way to know in advance
//     whether a given user's on-file email even belongs to an inbox this
//     job could poll. Even filling this form with a throwaway address just
//     produces a stranded, never-confirmed account — it does not get us
//     any closer to the actual application pages, so it wasn't attempted.
//   - Net effect: the entire multi-page application (contact/eligibility
//     info, and critically the household-member/SSN collection section
//     called out in required_documents) sits behind this login wall and
//     was never observed. No real field names/selectors for that part of
//     the flow exist yet anywhere in this codebase — anything claiming
//     otherwise would be guessed, which is exactly what we must not do on
//     a form that collects SSNs.
//
// To move this forward: either (a) get a real Benefy-controlled mailbox
// that can receive and confirm a CALIHEAPApply registration email so a
// persistent authenticated session can be established for the worker
// (session/cookie reuse, not per-job registration), or (b) find documented
// API/partner access CSD or SFPES offers to delivery partners instead of
// the public web UI. Until one of those exists, this adapter must stay
// verified: false and every submission routes to needs_human.
export const liheapSfpesAdapter: WebAdapter = {
  kind: "web_submit",
  programId: "liheap_sfpes",
  verified: false,

  async fillAndMaybeSubmit(): Promise<FillOutcome> {
    return {
      screenshots: [],
      unfillable: [
        "LIHEAP (caliheapapply.com) requires account registration with email confirmation before the application form is reachable — no anonymous fill path exists, so this cannot be automated without a Benefy-controlled mailbox to confirm a persistent login.",
      ],
      receiptNote: null,
    };
  },
};
