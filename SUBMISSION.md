# Benefy — Hackathon Submission

## Inspiration

Benefits under-enrollment is **one of California's largest quantified anti-poverty gaps** — and it's invisible. **Only about 70% of eligible Californians are enrolled in CalFresh**, one of the lowest SNAP participation rates in the country, leaving **roughly $1–2 billion a year in federal food benefits unclaimed**, before you even count unclaimed CalEITC, utility discounts, and free transit. **The money exists. The programs exist. The failure is discovery and paperwork.**

Great tools attack single slices of this: GetCalFresh streamlines one application, mRelief screens for SNAP, One Degree is a directory. But **someone who walks in asking about food stamps almost never learns, in the same sitting, that they also qualify for a utility discount, free Muni, and a tax credit they'd never heard of.** We wanted **one conversation that screens for everything at once.**

And one principle we couldn't get past: when you tell someone whether they qualify for a benefit, **you cannot be a confident-sounding language model that's occasionally wrong.** A hallucinated **"yes"** sends someone to a two-hour application they'll be denied for. A hallucinated **"no"** costs them thousands of real dollars. So we built Benefy around a hard rule: **the AI never decides eligibility.**

## What it does

Benefy ([usebenefy.com](https://www.usebenefy.com)) is a self-serve benefits screener for San Francisco residents. Describe your household in plain English — typed, tapped through quick-reply chips, or spoken — and in one conversation Benefy screens you against 17 real SF, California, and federal programs: CalFresh, Medi-Cal, SSI/SSP, CAPI, IHSS, General Assistance, PG&E CARE/FERA, LIHEAP, LifeLine, SFPUC water assistance, ERAP, DAHLIA BMR housing, Free Muni, Clipper START, Clipper Access, and CalEITC.

It then:

- **Estimates the annual dollar value** you're leaving on the table.
- **Flags uncertain cases for review instead of guessing.** If the engine can't honestly know, it returns `needs_review`, asks one targeted follow-up, re-runs, and updates the total in place.
- **Files the application for you**, or produces a signed-and-mailed-ready PDF, on the programs where that can be done safely.
- **Ships every result with a "View reasoning" trace** showing the exact function call and thresholds behind the verdict.
- **Runs the full guided intake in English or Spanish**, because SF's benefits-eligible population is heavily non-English-speaking.

## Why an agent, and not just a form?

The engine decides, so a fair question is why there's an LLM here at all. Because the form *is* the failure. Benefits are already gated behind long, correct, jargon-heavy forms, and roughly 30% of eligible Californians still don't enroll. Building a better questionnaire is building more of the thing that isn't working.

The agent does three things a survey structurally can't:

- **It asks only what changes an answer.** The engine returns `missing_fields` and `review_triggers` per program (`borderline_income`, `immigration_status_uncertain`, `missing_required_field`), so the next question is derived from what's actually blocking a verdict. A static survey has to ask the union of every field across all 17 programs, of everyone, upfront.
- **It does the translation the form demands of the applicant.** "My hours got cut so more like 1900 a month now" becomes a `monthly_income_gross` patch. Making a person render their own life into a government schema is the barrier, not the paperwork after it.
- **It handles what comes after the verdict.** The Navigator agent, backed by a Knowledge Base of official program pages, answers "what do I bring, where do I go, what happens next," and the apply worker drives the real form. A survey ends at a list; this ends at a submitted application.

The engine is the judge. The agent is the intake worker, the interpreter, and the person who walks you to the right window.

## How we built it

The heart of Benefy is a strict separation between **reasoning** and **deciding**.

**A deterministic rules engine is the only thing that returns a verdict.** `src/lib/engine.ts` is a pure, unit-tested `evaluate(profile, programs)`: same input, same output, every time. Every threshold and dollar figure lives in JSON (`fpl_table.json`, `ami_table.json`, `programs.json`) sourced from real 2026 official documents — HHS poverty guidelines, CDSS CalFresh limits, PG&E program pages, SF MOHCD income tables — with citations inlined per field. Next year's numbers are a JSON edit, not a code change.

**The LLM agents gather and explain. They never conclude.** The AI layer runs on DigitalOcean's Gradient AI platform in three tiers, tried in order and always labeled in the UI so the user knows which one answered:

1. **DO Agent Platform** — two managed agents (`benefy-intake`, `benefy-navigator`) with real attached DO Functions, an `explain_and_navigate` agent-to-agent route, and a Knowledge Base indexing official program pages. The platform invokes the deployed engine itself; our app only sees the side effects.
2. **DO Serverless Inference** — direct `llama3.3-70b-instruct` calls with real tool-calling, used if an agent call errors or exceeds its deadline.
3. **A local heuristic fallback**, so the demo never hard-fails.

Every eligibility verdict, in all three tiers, comes from a `check_eligibility` function call into the same deterministic engine. If the model editorializes, code-level guardrails strip guarantee language from its output, and an eval harness asserts the Navigator never claims more than the engine returned. The model contributes to the conversation but never to the decision set, and that constraint is enforced structurally, not by prompting.

We measured that honesty contract on the platform itself: a 10-query golden set run through **DigitalOcean Agent Evaluations** against the live agent scored **100/100 on prompt-injection resistance** and **87.5 on context adherence** (our star metric, passing its 85% bar). The whole thing ships on **DO App Platform**. Voice intake is the one non-DO AI piece (OpenAI Realtime), and it feeds the exact same engine.

## Closing the last mile: one-click apply

Screening is worthless if it still ends at a wall of PDFs, so Benefy actually submits applications. A separate DO App Platform worker polls a submissions queue and runs a per-program adapter: **Playwright** driving the program's real government or utility form in headless Chromium, or **pdf-lib** filling the real AcroForm PDF.

The same honesty discipline applies. The Playwright path is a two-pass, human-in-the-loop state machine: `queued → filling → awaiting_review → (human confirms) → submitting → submitted`. The adapter fills the entire form on a dry run first, screenshotting every step and stopping before anything irreversible, then re-fills from scratch and submits for real only after the person taps **Confirm**. Every adapter carries a `verified` flag, and the worker refuses to submit against an unverified one, routing to `needs_human` rather than guessing selectors on a live benefits site. SSNs are encrypted in the web app and decrypted only inside the worker.

**Three adapters are live-verified today** (SFPUC water via Playwright, PG&E CARE via filled PDF, and CalEITC via filled PDF). The rest are implemented but deliberately held back — blocked by one-time-code registration gates, a hard Cloudflare block, and, on PG&E FERA, an unusually undocumented final confirmation step we wouldn't click blind without a human confirming what it actually does. That restraint is the point: we'd rather hand off honestly than fabricate a field on a government form.

## Challenges we ran into

- **Live agent latency.** Real Agent Platform calls took 30–80 seconds, far longer than anyone will wait at a kiosk. We made the dollar reveal pure engine (it renders instantly, never waiting on a model) and streamed the plain-language explanation in asynchronously behind a 15-second deadline with tier-by-tier fallback.
- **Modeling honest uncertainty.** Net-income deductions, asset tests, and in-process immigration paperwork can't be evaluated truthfully from a quick screen. So `needs_review` became a first-class outcome with a targeted resolution loop, and those items are excluded from the savings total so the headline number is never inflated.
- **Automating real government forms without fabricating anything.** Every verified adapter was built by walking the live form screen by screen, recording real selectors and consent checkboxes. Anything the form required that our profile didn't carry was routed to "unfillable" instead of invented.

## What we learned

**"Trustworthy AI" is an architecture decision, not a prompt.** You don't stop an LLM from hallucinating eligibility by asking nicely. You make it structurally incapable of being the source of a verdict, then measure that with evals on every commit and on the platform. Building the trace view forced that discipline to be visible: if we couldn't show the audit trail, we hadn't earned the claim. The same lesson carried into automation, where refusing to submit one unverified form was worth more than shipping ten shaky ones.

## What's next

- Verifying more apply adapters and expanding one-click submission as each live form is safely walked.
- Full Spanish and Chinese across results and explanations (the intake layer already switches).
- A WCAG accessibility pass for the population that needs this most.
