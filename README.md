# Benefy

A self-serve benefits-screening tool for San Francisco residents. You describe your own household in
plain English; Benefy extracts a structured profile, runs a **deterministic eligibility engine**
against three real SF/CA benefit programs, estimates the annual dollar value, flags uncertain cases for
human review, and produces a pre-filled draft application.

**Core principle:** the AI never decides eligibility. A pure, unit-tested rules engine
(`src/lib/engine.ts`) is the only code path that ever returns `likely_eligible` / `likely_ineligible` /
`needs_review`. That engine is exposed to a Gradient AI **Intake Agent** as a callable
function/tool (`check_eligibility` — see `src/lib/gradient/tools.ts`): the agent gathers information and
explains results, but the yes/no always comes from the function call, never the model.

## Running locally

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # engine + eval-harness unit tests (vitest)
npm run build     # production build
```

No database, no auth, no API keys required to run the full demo — each visitor's session is held in an
in-memory store (`src/lib/store.ts`) that resets when the server restarts, by design (spec: demo data
only, no real PII).

## Architecture

```
your free text
        │
        ▼
   [Router]  ──capture info──▶  [Intake Agent] ──tool call──▶  check_eligibility()  ──▶  [deterministic engine]
        │                                                                                        │
        └──explain/what's-next──▶ [Navigator Agent] ◀── grounded in program config / KB ◀────────┘
```

- **`src/lib/engine.ts`** — the deterministic eligibility engine. Pure function `evaluate(profile,
  programs, fplTable)`. Same input always yields same output (see `tests/engine.test.ts`, 12 cases).
- **`src/config/`** — `fpl_table.json`, `ami_table.json`, `programs.json`. All thresholds and dollar
  values live here, not in code, and are sourced from real 2026 official documents (see "Data sources"
  below). Swapping next year's numbers means editing JSON, not logic.
- **`src/lib/gradient/`** — the Gradient AI integration layer:
  - `client.ts` — thin fetch wrapper for DigitalOcean Gradient AI's OpenAI-compatible agent endpoints.
  - `tools.ts` — the `check_eligibility` function/tool definition + executor (the centerpiece: this is
    what the Intake Agent calls instead of guessing).
  - `intakeAgent.ts` / `intakeExtractor.ts` — Intake Agent orchestration, with a local heuristic
    extractor as fallback.
  - `navigatorAgent.ts` — Navigator Agent orchestration; explains results and cites the same program
    config a Knowledge Base would be built from, with a grounded local-template fallback.
  - `router.ts` — multi-agent routing between Intake and Navigator based on the user's message.
  - `guardrails.ts` — real code-level guardrail: strips/flags guarantee-style language
    ("you WILL get...") from any agent output, live or fallback.
  - `evals.ts` — an agent-evaluation harness: known-answer test cases run end-to-end through the engine
    + Navigator + guardrails, explicitly checking the Navigator never asserts eligibility beyond what
    the engine actually returned (`tests/evals.test.ts`).
- **`src/app/api/`** — Next.js route handlers: client CRUD, `intake` (chat turn → router → agent),
  `screen` (invokes the function/tool + records a trace), `application/[programId]` (pre-fill), and
  `gradient/evals`.
- **`src/app/clients/[id]`** — the screening workspace UI (chat + live profile panel → results with
  dollar reveal, program cards, "View reasoning" trace toggle → pre-filled application view).

### What's live vs. fallback, honestly

This build has **no DigitalOcean account wired to it** — there was no Gradient AI credential available
in this environment. Every piece of the architecture above is real, tested code, but the Intake/Navigator
agent calls run in **local fallback mode**: a heuristic text extractor stands in for the Intake Agent's
LLM extraction, and a template generator grounded in `programs.json` stands in for the Navigator Agent's
Knowledge-Base-backed explanation. The UI labels every explanation with its mode
(`local_fallback` vs `live_gradient_agent`) so this is never hidden.

Everything else — the deterministic engine, the function/tool schema, the router, the guardrails, the
eval harness, the trace log — is real and exercised by the fallback path today, and becomes the real
Gradient-backed path the moment credentials are set (no code changes required, see below).

## Wiring real Gradient AI (to actually enter the "Best Use of Gradient AI" track)

1. In the DigitalOcean Gradient AI Platform, create two **Agents**:
   - **Intake Agent** — attach the `check_eligibility` tool (schema in `src/lib/gradient/tools.ts`,
     mirror it into the Gradient console's function definition). Point its backing model at Serverless
     Inference.
   - **Navigator Agent** — attach a **Knowledge Base** indexing the real CalFresh / PG&E CARE / SFMTA
     source documents (the same ones cited in `programs.json`'s `_source` fields). Turn on
     **guardrails** for guarantee-language and sensitive-data blocking.
2. Set env vars (see `.env.example`):
   ```
   GRADIENT_INTAKE_AGENT_ENDPOINT=https://<intake-agent-id>.agents.do-ai.run
   GRADIENT_INTAKE_AGENT_ACCESS_KEY=...
   GRADIENT_NAVIGATOR_AGENT_ENDPOINT=https://<navigator-agent-id>.agents.do-ai.run
   GRADIENT_NAVIGATOR_AGENT_ACCESS_KEY=...
   ```
3. Upload `src/lib/gradient/evals.ts`'s `EVAL_CASES` as a Gradient **Agent Evaluation** dataset and run
   it through the platform's eval runner.
4. Deploy to **DigitalOcean App Platform** pointed at this repo (`npm run build` / `npm start`).
5. During a demo, open the Gradient workspace's **trace** view alongside this app's own "View reasoning"
   toggle on the Results screen — both show the same chain: router → intake/function-call → engine
   result → navigator explanation.

## Data sources (2026 figures, verify before relying on them)

| Figure | Source |
|---|---|
| Federal Poverty Level table | HHS ASPE, 2026 Poverty Guidelines (48 contiguous states) |
| CalFresh gross income limit / max allotment | CDSS, 2025-2026 CalFresh Income & Eligibility Limits (eff. 10/1/2025–9/30/2026) |
| PG&E CARE discount % and income basis | PG&E CARE program page (income guidelines valid through 5/31/2027) |
| SFMTA Free Muni eligibility & AMI table | SFMTA Free Muni pages; SF MOHCD 2026 Maximum Income by Household Size (eff. 6/1/2026) |
| Muni monthly pass price | SFMTA Fares page |

Full citations and effective dates are inlined as `_source` / `_note` fields in
`src/config/*.json`. CalFresh and PG&E CARE per-household benefit *value estimates* are explicitly
labeled illustrative averages (not guaranteed benefit amounts) since exact net-income deduction math is
out of scope for this MVP.

## Trying it out

Landing page → "Check what I qualify for" creates a fresh, blank profile and drops you straight into
the intake chat — no account, no caseload list. A few example prompts to try (each exercises a
different path through the engine):

1. "Single mom, two kids, on Medi-Cal, make about $2,500/month, live in the Tenderloin." → categorical
   CalFresh + CARE pass.
2. "68-year-old retired veteran, live alone in the Mission, Social Security is my only income, about
   $14,000/year." → CalFresh + CARE + Free Muni all fire on income.
3. "Parent and one kid, income's around $43,900/year, my visa paperwork is still in process." →
   needs-review triggers on immigration status, $0 counted until resolved.
4. "Household of 2, I have a disability and get SSDI plus part-time contract income, about $58,000/year
   total." → too high for CalFresh/CARE, but disability-linked Free Muni still fires — an honest "no"
   alongside a "yes."
5. "I'm 52, I get SSI for a qualifying disability, live alone in SoMa." → categorical pass fires for
   CalFresh and CARE without an income test at all.

## Testing

`npm test` runs 13 cases across two suites:
- `tests/engine.test.ts` — determinism, all four `needs_review` triggers, categorical pass, hard gates,
  clear eligible/ineligible bands, savings-total exclusion of needs-review items.
- `tests/evals.test.ts` — the Gradient agent-evaluation harness (`src/lib/gradient/evals.ts`), including
  the explicit "Navigator never asserts eligibility beyond the engine's actual verdict" check.

## Explicit non-goals (per spec)

No real e-filing (pre-fill only, labeled "review and submit"), no auth/real PII storage, only 3 programs,
no full net-income/asset-test math, no multilingual/voice intake.
