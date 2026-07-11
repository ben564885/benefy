# Benefy

**Live at [www.usebenefy.com](https://www.usebenefy.com)** — a self-serve benefits screener for San
Francisco residents. You describe your household in plain English (typed, tapped, or spoken), and
Benefy screens you against **17 real SF/CA/federal benefit programs** in one conversation, estimates
the annual dollar value you're leaving on the table, flags uncertain cases for review instead of
guessing, and produces a pre-filled draft application.

**Core principle: the AI never decides eligibility.** A pure, unit-tested rules engine
(`src/lib/engine.ts`) is the only code path that ever returns `likely_eligible` /
`likely_ineligible` / `needs_review`. The LLM agents gather information and explain results, but
every verdict comes from a real function call into that engine — never from the model. Every result
in the UI ships with a "View reasoning" trace showing exactly that chain.

## Why this exists

Benefits under-enrollment is one of the largest quantified anti-poverty gaps in California. Only
around 70% of eligible Californians are enrolled in CalFresh — among the lowest SNAP participation
rates in the country — leaving on the order of **$1–2 billion a year in federal food benefits
unclaimed statewide**, with hundreds of millions more in unclaimed CalEITC (figures widely cited by
CDSS and county human-services agencies; verify before quoting precisely). The money exists, the
programs exist — the failure is discovery and paperwork.

Great tools already attack single slices of this: **GetCalFresh** (Code for America) streamlines one
program's application, **mRelief** screens for SNAP, **One Degree** is a searchable directory.
Benefy's angle is different: **one conversation screens all 17 programs at once**, cross-program
(food, utilities, transit, health, cash, housing, tax credits), and the number you're shown is the
output of an auditable, deterministic engine — not a language model's opinion. Someone who came to
check on food stamps leaves knowing they also qualify for a utility discount, free Muni, and a tax
credit they'd never heard of.

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in at least the Supabase vars (persistence + auth)
npm run dev                  # http://localhost:3000
npm test                     # engine + eval-harness tests (19 tests, vitest)
npm run build                # production build
```

Supabase (free tier) provides persistence (`supabase/schema.sql`) and email-OTP auth
(`supabase/002_auth.sql`). All AI credentials are optional — see "Three backends" below; without
them the app runs on its local fallback path and labels itself accordingly.

## Architecture

```
your free text / quick-reply chips / voice
        │
        ▼
   [Router]  ──capture info──▶  [Intake Agent] ──tool call──▶  check_eligibility()  ──▶  [deterministic engine]
        │                                                                                        │
        └──explain/what's-next──▶ [Navigator Agent] ◀── grounded in program config / KB ◀────────┘
```

- **`src/lib/engine.ts`** — the deterministic eligibility engine. Pure function `evaluate(profile,
  programs)`. Same input always yields same output (`tests/engine.test.ts`).
- **`src/config/`** — `fpl_table.json`, `ami_table.json`, `programs.json` (17 programs). All
  thresholds and dollar values live here, not in code, sourced from real 2026 official documents
  (see "Data sources"). Swapping next year's numbers means editing JSON, not logic.
- **`src/lib/gradient/`** — the DigitalOcean AI integration layer: agent orchestration
  (`intakeAgent.ts`, `navigatorAgent.ts`), multi-agent routing (`router.ts`), the
  `check_eligibility` / `update_client_profile` function-tool definitions (`tools.ts`), code-level
  guardrails that strip guarantee language from any agent output (`guardrails.ts`), and an eval
  harness asserting the Navigator never claims more than the engine returned (`evals.ts`).
- **`functions/`** — the same tools deployed as real DigitalOcean Functions
  (`benefy-update-profile`, `benefy-check-eligibility`, `benefy-get-screening`), which the managed
  Agent Platform agents invoke; they call back into `/api/functions/*` (authenticated by a shared
  secret, `src/lib/functionAuth.ts`) so the *deployed* engine is still the single source of truth.
- **`src/app/api/`** — Next.js route handlers: client CRUD, `intake` (chat turn → router → agent),
  `screen` (tool call + trace record), `application/[programId]` (pre-fill), realtime voice session.
- **`src/app/clients/[id]`** — the screening workspace: guided chat with quick-reply chips
  (**English/Spanish toggle** — 🇺🇸/🇪🇸), free-text intake, voice intake, results with dollar
  reveal, program cards, "View reasoning" trace, pre-filled application view.

### Three backends, tried in order (what's live, honestly)

1. **DigitalOcean Agent Platform** *(live)* — `benefy-intake` / `benefy-navigator` managed agents
   with real attached DO Functions. The platform invokes the deployed functions itself; our app only
   sees the side effects and the final reply.
2. **DigitalOcean Serverless Inference** *(live)* — direct `llama3.3-70b-instruct` calls with real
   tool-calling orchestrated in our backend (`inferenceClient.ts`), used if an agent call errors.
3. **Local heuristic fallback** — a conservative regex extractor and template explanations grounded
   in `programs.json`, so the demo never hard-fails. The UI labels every explanation with its mode
   (`live_gradient_agent` / `live_inference` / `local_fallback`) — this is never hidden.

Voice intake ("Voice (beta)") uses the OpenAI Realtime API — labeled here because it's the one
AI piece that is *not* DigitalOcean; its extracted fields flow into the exact same profile store and
deterministic engine as text intake.

### Language support

The guided intake (questions, quick-reply chips, income stepper, completion summary) has a full
Spanish mode behind a flag toggle (🇺🇸/🇪🇸). Free-text intake in Spanish is answered in Spanish by
the live agents. Chips send canonical English values under the hood, so extraction behaves
identically in both languages. Results/explanations are English-only for now — see roadmap.

## Programs covered (17)

CalFresh (SNAP) · Medi-Cal · SSI/SSP · CAPI · IHSS · CAAP/General Assistance · PG&E CARE ·
PG&E FERA · LIHEAP · California LifeLine · SFPUC Water/Sewer Assistance · SF ERAP (rental
assistance) · DAHLIA BMR housing lottery · Free Muni (seniors/disabilities) · Clipper START ·
Clipper Access (RTC) · CalEITC

## Data sources (2026 figures, verify before relying on them)

Full citations and effective dates are inlined as `_source` / `_note` fields in
`src/config/*.json`. Highlights:

| Figure | Source |
|---|---|
| Federal Poverty Level table | HHS ASPE, 2026 Poverty Guidelines (48 contiguous states) |
| CalFresh gross income limit / max allotment | CDSS, 2025–2026 CalFresh Income & Eligibility Limits (eff. 10/1/2025–9/30/2026) |
| PG&E CARE / FERA discount % and income basis | PG&E program pages (income guidelines valid through 5/31/2027) |
| SF AMI table (Free Muni, DAHLIA, ERAP) | SF MOHCD 2026 Maximum Income by Household Size (eff. 6/1/2026) |
| Transit fares & discounts | SFMTA Fares pages, MTC Clipper START |

Per-household benefit *value estimates* are explicitly labeled illustrative averages (not guaranteed
amounts) — exact net-income deduction math is out of scope, and programs whose tests can't be
modeled honestly return `needs_review` rather than a guess.

## Testing

`npm test` runs 19 tests across two suites:

- `tests/engine.test.ts` — determinism, all `needs_review` triggers, categorical passes, hard
  gates, clear eligible/ineligible bands, savings-total exclusion of needs-review items.
- `tests/evals.test.ts` — the agent-evaluation harness (`src/lib/gradient/evals.ts`), including the
  explicit "Navigator never asserts eligibility beyond the engine's actual verdict" check, run
  through the real guardrails.

## Demo

See [DEMO.md](DEMO.md) for the 3-minute judging walkthrough, including the trace-view beat and the
fallback plan if live inference is slow.

## Explicit non-goals (per spec) & roadmap

No real e-filing (pre-fill only, labeled "review and submit"), no full net-income/asset-test math
(those programs honestly return `needs_review`). Next: Spanish/Chinese across results and
explanations (the intake layer already switches), a WCAG accessibility pass, and deep links from
each program card into its real application portal to close the last mile from *screened* to
*enrolled*.
