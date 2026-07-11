# benefy-apply-worker

Separate DO App Platform **worker** component (no HTTP port) from the main
Next.js **web** service. Polls `public.submissions` (see `../supabase/schema.sql`)
and executes each row via a per-program adapter — either a Playwright
`web_submit` adapter or a `pdf-lib` `pdf_fill` adapter (`src/adapters/`).

## Why a separate deployable

Playwright needs Chromium (~300MB) and can run for minutes per job; the web
app just enqueues rows and reads status (`src/app/api/clients/[id]/apply/route.ts`,
`.../submissions/[id]/confirm/route.ts`). See `.do/app.yaml` for both
components' config — `web` is `services`, this is `workers`.

## State machine

`queued` → `filling` → `awaiting_review` → (human confirms) → `submitting`
→ `submitted` | `failed` | `needs_human`

`web_submit` adapters run their **entire fill logic twice**, always on a
fresh `page`/browser context — never across the async human-review gap:

1. `commit=false` right after enqueue (dry run) — fills the whole form,
   screenshots each step, stops before anything irreversible. Feeds the
   `awaiting_review` screen.
2. `commit=true` after the human taps Confirm — re-fills from scratch
   (idempotent) and this time performs the real submit.

`pdf_fill` adapters have no review gate — nothing is transmitted anywhere;
the output is just a downloadable PDF the user still has to sign and mail
or upload themselves per the program's own instructions.

**Every adapter has a `verified: boolean`.** `worker/src/index.ts` refuses
to run `commit=true` (web) or `fill()` (pdf) against `verified: false` —
those submissions go straight to `needs_human` with an explanation. Never
flip `verified` to `true` without an actual live walkthrough (see below).
Fabricated selectors against real government/utility sites are worse than
no automation — see the "adapters must never guess" rule in
`src/adapters/types.ts`'s `FillOutcome.unfillable` doc comment.

## Adapter status (as of 2026-07-11)

| program_id | apply_mode | verified | notes |
|---|---|---|---|
| `sfpuc_cap` | web_submit | ✅ true | Live-walked all 4 pages via the `browse` skill against `forms.office.com/g/Ut4PWU2b1y`. Real TransUnion soft-pull consent on page 3 — see `sfpuc_cap.ts` doc comment. Additional-income-earner households route to `needs_human` (sub-form unverified). |
| `pge_care` | pdf_fill | ✅ true | Real AcroForm field names read via pdf-lib against the live PDF. Signature/date left blank by design (perjury attestation — human must sign). |
| `caleitc` | pdf_fill | ❌ false | FTB Form 3514's 95 AcroForm fields are opaque generated codes (`3514_Form_1016`, etc.) with no semantic names — filling this blind on a tax document is a real risk of misfiling SSN/income into the wrong box. Needs a visual field-position audit before it's safe to automate. |
| `pge_fera` | web_submit | ❌ false | Live-walked and fully implemented against `energyinsight.pge.com/carefera` (real shadow-DOM selectors, confirmed working through the entire "Account Information" + "Confirmation" review screen). Held back from `verified: true` for one reason: the Confirmation page's own final "NEXT >" button was never clicked live, and a full text dump of that screen found no perjury/attestation/submit language anywhere — unusual for a benefits application, enough doubt to require a human to run one real `commit=true` pass and confirm what that click actually does before flipping this to `true`. |
| `liheap_sfpes` | web_submit | ❌ false | Live-walked `caliheapapply.com` — blocked before reaching any application field. The site requires account registration with email confirmation (ASP.NET Core Identity default scaffold); no anonymous apply path exists. Needs either a Benefy-controlled mailbox to confirm a persistent session, or documented CSD/SFPES partner API access. |
| `ca_lifeline` | web_submit | ❌ false | Live-walked `californialifeline.com` — hard Cloudflare block (error 1020) on every attempt, headless and headed. Independent research (the official paper application + CPUC's eligibility page) indicates new enrollment is PIN-gated and carrier-initiated anyway, not a single self-serve form — this may belong as `assisted` long-term rather than `web_submit`. |
| `clipper_start` | web_submit | ❌ false | Live-walked `clipperstartcard.com/s/application` — filled the only unlocked section ("Account Information") with real selectors, then hit a passwordless email/SMS OTP wall blocking Profile Information, Mailing Address, Verification Method, and the required Proof of Identity/Income document uploads. No way for the worker to read a one-time code from a real inbox. Also found: the live form requires `phone`, which isn't currently in this program's `required_application_fields` in `src/config/programs.json`. |

All other programs (`calfresh`, `medi_cal_magi`, `ssi_ssp`, `capi`, `ihss`,
`caap_ga`, `sfmta_free_muni`, `sf_erap`, `dahlia_bmr`, `clipper_access_rtc`)
are `apply_mode: "assisted"` in `src/config/programs.json` — no worker
adapter exists or is planned; those stay on the existing prefill-sheet
handoff (auth-walled portals, in-person steps, or lottery/informational
pages, per the original apply-automation plan).

## How to verify a stub adapter

1. Use the `browse` skill (`~/.claude/skills/gstack/browse/dist/browse`) —
   or the Playwright MCP if available — to walk the **entire** real form,
   screen by screen, exactly as a user would. Fill test data. **Never click
   the final Submit/Finish control** — stop one step before it.
2. Note every field's real accessible name/selector, every required
   consent/attestation checkbox, every branch (e.g. "do you have other
   income earners?") and what happens on each branch.
3. Write the adapter following `sfpuc_cap.ts`'s shape: a doc comment citing
   the live walkthrough date and URL, `fillAndMaybeSubmit(page, data, commit)`
   using real Playwright locators (`getByRole`, exact text matches drawn
   directly from what you observed — never guessed), and route anything the
   live form requires that `ApplicantProfile` doesn't carry into
   `unfillable` rather than fabricating a value.
4. Only set `verified: true` once you've confirmed the fill logic runs
   clean end-to-end (dry run) with real profile data.
5. Update the status table above and `src/adapters/registry.ts` if the
   import wasn't already wired in.

## Local dev

```bash
npm install
npx playwright install chromium   # not needed in the Docker image (baked in)
cp .env.example .env               # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APPLY_ENCRYPTION_KEY
npm run dev
```

`APPLY_ENCRYPTION_KEY` must be the **same value** here and in the web app's
env — it's how SSNs encrypted by the web app get decrypted here (see
`src/lib/crypto.ts`, duplicated from `../src/lib/apply/crypto.ts`).

Also requires a private Supabase Storage bucket named `submission-artifacts`
(Storage → New bucket → Public: off) — screenshots and generated PDFs are
uploaded there with signed URLs (`src/lib/storage.ts`).
