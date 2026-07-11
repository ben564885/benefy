# Judge Q&A — quick-reference (bullet form)

Full prose version: `Benefy - Judge QA Prep.docx`. This is the skim-before-you-walk-up version.

**Ground rules**
- Agent Platform is genuinely live — say so, and be ready to prove it in console.
- Live: Agent Platform (2 agents + 3 Functions + 1 KB), Serverless Inference (fallback), App
  Platform (hosting), Agent Evaluations (1 completed run).
- Not yet done: platform Guardrails not attached; 1/10 eval rows unscored. Say so if asked.
- Always route back to: the engine decides, never the model.

---

## Scoring criteria — "Best Use of DigitalOcean AI Platform"

**How do you use the DO AI Platform?**
- Agent Platform: `benefy-intake` + `benefy-navigator`, both `STATUS_RUNNING`
- Intake → functions `update_client_profile`, `check_eligibility`; routes to Navigator as child agent
- Navigator → function `get_screening_result`; Knowledge Base `benefy-program-docs` indexed + attached
- 3 DO Functions deployed (`benefy-functions` namespace), actually invoked by the live agents
- Serverless Inference (`llama3.3-70b-instruct`, real tool-calling) — tier-2 fallback
- Agent Evaluations — real completed run `benefy-navigator-honesty-run-3`: 100/100 injection, 87.5
  context adherence (star metric), 77.8 correctness, 65.6 ground-truth faithfulness
- App Platform — `web` + `apply-worker` services

**Is this deep integration or a demo API call?**
- Exact spec from DO's own OpenAPI (`GRADIENT_SETUP.md`): faas_name/namespace, `if_case` routing,
  hierarchical KB chunking, dataset→test case→run eval flow
- All of it actually executed, not just designed — confirmable live in console right now

**Why a rules engine instead of just asking the LLM?**
- Wrong eligibility answer has real consequences
- `engine.ts` = pure function, same input → same output (`engine.test.ts`)
- Both agents structurally limited to calling the engine for a verdict — never asserting one themselves

**Social good case?**
- ~70% CalFresh enrollment among eligible CA residents — lowest in US
- $1–2B/year unclaimed food benefits statewide (CDSS/county estimates)
- Failure = discovery + paperwork, not lack of programs
- Benefy: 17 programs, one conversation, cross-program discovery

**Who's it for?**
- Self-serve public tool (`usebenefy.com`, email-OTP)
- Originally designed for SF caseworkers (see agent system prompts) — same flow works for both

---

## Technical / backend

**End-to-end flow?**
- Chips → local, zero model calls → `update_client_profile` (DO Function) → Supabase
- All required fields present → `check_eligibility` (DO Function) → `engine.ts` (pure)
- Dollar total renders instantly (engine never waits on model)
- Hands off to `benefy-navigator` (real agent route) for grounded explanation
- Every step recorded as `TraceStep` → "View reasoning" on results card

**Three-tier fallback?**
- 1. Agent Platform (live, primary) → 2. Serverless Inference (errors/timeout fallback) →
  3. local regex + template (zero-credential fallback)
- UI always labels the mode: `live_gradient_agent` / `live_inference` / `local_fallback`

**How do you stop hallucinated eligibility answers?**
- Structural: only DO Function → engine can produce a verdict; Navigator re-fetches, never trusts
  earlier conversation claims
- Guardrails: `guardrails.ts` strips guarantee language + PII leaks on every output, any tier
  (platform-level Guardrails not attached yet — real gap)
- Evals: local harness (CI, every commit) + real DO Agent Evaluations run against live Navigator

**What's `needs_review`?**
- Missing required field or ambiguous hard gate (e.g. unknown immigration status never defaults to
  "citizen")
- Excluded from dollar total until resolved
- "Resolve →" loop asks one targeted question, re-runs engine, shows delta (`resolutionAgent.ts`)

**Data handling / security?**
- Supabase RLS enabled on `clients`/`consents`/`submissions`, service-role only, no public policies
- SSNs/account numbers: AES-256-GCM field-level encryption, random IV (`apply/crypto.ts`)
- `/api/functions/*` protected by shared secret (`functionAuth.ts`)

**What's actually automated in "apply"?**
- `pdf_fill` (PG&E CARE, CalEITC): downloadable pre-filled PDF, user signs/submits manually
- `web_submit`: only SFPUC CAP is `verified: true` — dry run reviewed by user, then real submit
  after human confirmation
- Unverified adapters refuse to run (`worker/README.md` status table); most programs are
  prefill/handoff only, no automation

**Is this really AI or mostly if-statements?**
- Both, deliberately: eligibility = 100% deterministic code (the safety story)
- AI = structured extraction from free text/voice, grounded plain-language explanation, bilingual
  intake — the parts LLMs are actually good at

**Numbers?**
- 17 programs · 31 tests / 3 suites · 2 live agents · 3 DO Functions · 1 indexed KB ·
  1 completed eval run (10 rows, 4 metrics) · 2 languages (EN/ES)

---

## Differentiation

**vs. a Google Form / static quiz?**
- No follow-ups, no messy free text, no Spanish voice, no per-program threshold engine behind it
- Even Benefy's fast chip path still runs the real deterministic engine underneath

**vs. ChatGPT / generic chatbot?**
- No audit trail, no guaranteed-correct thresholds, no structural block on hallucinated verdicts
- Benefy: only a DO Function → engine can answer eligibility; Navigator grounded in a real
  indexed KB, not general model knowledge

**vs. GetCalFresh / mRelief / One Degree / 211?**
- Each covers one slice (one program, one benefit type, or a directory)
- Benefy: cross-program, 17 at once, one conversation, one consistent deterministic verdict source

**Does this replace a caseworker?**
- No — `needs_review`, unverified apply adapters, and anything needing a signature route to a
  human, not around one

---

## Skeptical / "prove it"

**Prove the AI never decides eligibility**
- Open "View reasoning" → walk the trace → `check_eligibility` call → engine return value
- `engine.test.ts`: same input twice → identical output

**Prove the Agent Platform is actually live**
- DO console → Agent Platform → `benefy-intake` / `benefy-navigator` → `STATUS_RUNNING`
- Resources tab: functions attached, route to Navigator, KB attached
- Evaluations tab → `benefy-navigator-honesty` → real run, real timestamped scores

**Are the dollar figures real?**
- Thresholds: real 2026 figures, cited inline in `src/config/*.json`
- Value estimates: labeled illustrative averages, not guarantees
- Anything unmodelable honestly → `needs_review`, not a guess

**Why does the eval run say "partially successful"?**
- 1 of 10 golden-set rows wasn't scored by the platform (platform-side issue, not a wrong answer)
- Other 9 rows fully scored across all 4 metrics — those are the numbers quoted
- Not yet root-caused which row/why — say that plainly if pressed

**What's not done?**
- Platform Guardrails (Jailbreak/Sensitive Data) not attached yet — console-only step, no API
- No real e-filing beyond a few `verified: true` adapters
- No full net-income/asset-test math — those return `needs_review`
- Results/explanations English-only (intake + voice are bilingual)
- SF only — architecture supports more counties/states, data entry not done
- No WCAG audit yet
- 1/10 eval rows unscored (see above)

---

## Rapid-fire one-liners

- **Stack:** Next.js on DO App Platform (web) + separate worker service, Supabase, DO Agent
  Platform (primary) + Serverless Inference (fallback), OpenAI Realtime for voice only
- **Open source?** Point to `GRADIENT_SETUP.md` for DO depth, or the live console for proof it's deployed
- **Hardest part?** Building fallback tiers so a slow/erroring model call never blocks the dollar
  reveal — engine had to be provably independent of the model layer
- **Next steps?** Attach Guardrails, root-cause the unscored eval row, expand net-income coverage,
  verify more apply adapters, bilingual results
