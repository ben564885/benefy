# Benefy — 3-minute judging demo script

## Before judging starts (do once)

- [ ] Sign in at [www.usebenefy.com](https://www.usebenefy.com) (email OTP) so the demo starts
      authenticated — don't burn 30 seconds on an OTP email in front of judges.
- [ ] **Attach platform guardrails (2 min, console-only — no API for this):** DO console → Agent
      Platform → workspace `benefy` → open `benefy-intake` → Resources → GUARDRAILS → *Add
      guardrails* → attach **Jailbreak** and **Sensitive Data**. Repeat for `benefy-navigator`.
      Then the story is: platform guardrails + our code-level guardrail layer + eval-enforced
      honesty.
- [ ] Open two DO console tabs pinned for beat 4: the `benefy-intake` agent's **Resources** page
      (functions + route + KB visible in one screen) and the **Evaluations** page showing the
      `benefy-navigator-honesty` test case with the `benefy-navigator-honesty-run-1` results.
- [ ] Do one full dry run to warm everything (first inference call of the day is the slowest).
- [ ] Have `npm test` output in a terminal tab — 19 passing tests is a 3-second flash worth having.

## The script

### Beat 1 — the problem (20s)

> "Only about 70% of eligible Californians are enrolled in CalFresh — that's on the order of a
> billion-plus dollars a year in unclaimed food benefits in this state alone, before you count
> utility discounts, transit passes, and tax credits. The money exists; discovery is the failure.
> Benefy screens you for **17 SF, California, and federal programs in one conversation**."

### Beat 2 — guided intake + Spanish toggle (40s)

Landing page → **Check what I qualify for**. Answer the guided chips fast:
*Household of 2 → $1,400/month → SF: Yes → U.S. citizen → senior 65+.*

Mid-flow, tap the **🇪🇸 flag** — questions, chips, and the income stepper flip to Spanish
instantly. One line: "SF's benefits-eligible population is heavily non-English-speaking — the
intake layer is already bilingual, and the LLM answers free text in whatever language you write."
Tap 🇺🇸 back.

### Beat 3 — the reveal (20s)

The screening runs automatically when the last required field lands — the dollar total renders
instantly (the engine is pure code; it never waits on a model). The plain-language explanation
fills in a few seconds later, labeled with which Gradient tier produced it.

> "That's per year, from a household that probably came in asking about one program."

### Beat 4 — THE PRIZE-WINNING BEAT: the trace (45s)

Open **View reasoning** on the results card. Walk it slowly:

> "Watch what actually happened: the model asked questions, but when it came time for a verdict, it
> called a **function** — `check_eligibility` — and that function is a deterministic, unit-tested
> rules engine with every threshold sourced from the actual 2026 HHS, CDSS, and MOHCD documents.
> **The AI never decides eligibility.** It can't. The only code path that returns
> eligible/ineligible is this engine, and you can audit every step right here. On top of that,
> code-level guardrails strip guarantee language from anything the model says, and our eval suite
> asserts the explainer agent never claims more than the engine returned."

Then flip to the pinned DO console tabs — this is the sponsor-judge money shot:

1. **`benefy-intake` Resources page**: two real attached DO Functions (`update_client_profile`,
   `check_eligibility`), the `explain_and_navigate` agent route handing off to `benefy-navigator`,
   and (on the navigator) the `benefy-program-docs` Knowledge Base indexing GetCalFresh, SF HSA,
   SFMTA, and PG&E program pages — the platform invokes the deployed engine itself.
2. **Evaluations page**: the `benefy-navigator-honesty` test case — a 10-query golden set run
   through DigitalOcean's own Agent Evaluations against the live navigator, scoring ground-truth
   faithfulness, instruction following, hallucination, and prompt-injection resistance. One line:
   "We don't just claim the agent never over-promises eligibility — we measure it, on the
   platform's own eval runner, and our CI runs the same golden set locally on every commit."

### Beat 5 — honest uncertainty + close (30s)

Point at a **needs review** card (use an "immigration paperwork in process" example, or a
borderline income): "When the engine can't know, it says so — it never guesses someone into or out
of a benefit." Then open a program card → **pre-filled draft application**: "And it ends with a
draft application, not a dead end. Next step on the roadmap is deep-linking into each program's
real portal — closing the gap from *screened* to *enrolled*."

## Judge Q&A — likely questions

- **"How is this different from GetCalFresh / mRelief?"** — Those are excellent single-program
  tools (GetCalFresh streamlines one application; mRelief screens SNAP). Benefy is cross-program:
  one conversation, 17 programs across food, utilities, transit, health, cash, housing, and tax
  credits — and the verdict is deterministic and auditable, not model-generated.
- **"What if the LLM hallucinates an eligibility answer?"** — It structurally can't be the source
  of a verdict (only the engine returns one), guardrails strip guarantee language from its prose,
  and `tests/evals.test.ts` asserts the explainer never exceeds the engine's actual result.
- **"Are the dollar figures real?"** — Thresholds are real 2026 figures with citations inlined in
  the config. Value estimates are labeled illustrative averages; programs whose full test we can't
  model honestly return needs-review instead of a number.
- **"DigitalOcean usage?"** — Agent Platform (two managed agents + attached DO Functions),
  Serverless Inference (llama3.3-70b with real tool-calling) as the second tier, App Platform
  hosting, DO Functions for the deployed tools. Voice is the one non-DO AI piece (OpenAI Realtime),
  and it feeds the same engine.

## If something breaks live

- **Slow/failed model call:** the guided-chip path makes **zero model calls** until the final
  screening — it cannot hang. The dollar reveal is pure engine and renders instantly regardless;
  only the explanation depends on a model, and it fills in asynchronously.
- **Agent Platform hiccup:** live agent calls have a 15s deadline (`GRADIENT_AGENT_TIMEOUT_MS`),
  then the app auto-falls tier-by-tier (Agent Platform → Serverless Inference → local) and *labels
  the mode in the UI* — narrate it as a feature, because it is one: "three-tier degradation,
  honestly labeled." The Agent Platform work is still fully demoable in the console even if the
  fast path served the reply.
- **Wifi death:** `npm run dev` locally runs the whole flow on the local fallback path with no
  keys.
