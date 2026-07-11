# Benefy — live demo walkthrough (screenshot-anchored rehearsal)

Companion to [DEMO.md](DEMO.md) — that's the formal 3-minute script; this is the beat-by-beat
version anchored to what's actually on screen, written to rehearse as one continuous performance
rather than read off a doc. Use whichever fits the room.

## The full run, beat by beat

### 1. Landing page (~20s) — set the stakes, no AI yet

Click "Check what I qualify for."

> "Only ~70% of eligible Californians are enrolled in CalFresh — that's $1–2B/year in unclaimed
> food benefits in this state alone. The failure isn't lack of programs, it's discovery. Benefy
> screens 17 SF/CA/federal programs in one conversation."

Nothing AI has run yet — this is pure narrative.

### 2. Guided intake (~40s) — AI is silent on purpose

Answer the chips fast: household of 4, $130k/year, SF, LPR.

> "Notice this is instant — the quick-reply chips make zero model calls. We only spend a model
> call where free text actually needs interpreting."

Then type one free-text aside, e.g. "I also take care of my mom, she's 68" — that's when the
**Intake Agent** actually fires (Gradient agent → DO inference → local fallback tiers), extracting
`has_senior: true` from prose. That's the first real AI moment — point at it explicitly.

### 3. The reveal (~20s)

> "That $15,332/year total rendered the instant the last field landed — the engine is pure code,
> it never waits on a model."

Gesture at the chat bubble above it ("Got it — household of 4...").

> "That sentence, though, is the Intake Agent. It parsed my free text into structured fields. Two
> different systems, two different jobs."

### 4. THE prize beat — "View reasoning" (~45s)

Click into a card's "See application details" or the trace view. Walk it slowly.

> "The model asked questions, but when it came time for a verdict, it called a function —
> `check_eligibility` — a deterministic, unit-tested rules engine with thresholds sourced from
> real 2026 HHS/CDSS/MOHCD documents. The AI never decides eligibility. It structurally can't —
> the only code path that returns eligible/ineligible is this engine."

Then flip to the pinned DO console tabs:

- `benefy-intake` Resources page — real attached Functions (`update_client_profile`,
  `check_eligibility`), the route to `benefy-navigator`, the Knowledge Base attached on the
  navigator side.
- Evaluations page — `benefy-navigator-honesty-run-3`: 100/100 injection resistance, 87.5 context
  adherence.

> "We don't just claim the agent doesn't over-promise — we measure it, on DigitalOcean's own eval
> runner."

### 5. Needs-review honesty (~15s)

Point at an amber card (e.g. SSI/SSP or an immigration-status item).

> "$72,891/year of potential sits behind these — the engine won't guess. Immigration status
> uncertainty, income tests too complex to compute cleanly — it says 'needs review' instead of
> fabricating a number."

### 6. Apply flow (~30s)

Click **"Apply automatically."**

> "None of these programs support true auto-submit yet, so Benefy hands back prefilled drafts —
> nothing is ever submitted without you reviewing it and tapping Confirm."

If a `verified: true` adapter program (SFPUC CAP) is eligible in the demo household, swap it in
here — it's the one card that can show a real dry-run before human confirmation, per
`worker/README.md`'s status table. Otherwise, keep this beat to the prefill/consent screen only.

### 7. Close (~10s)

> "This ends with a draft application, not a dead end. Next step is deep-linking into each
> program's real portal."

## Gap vs. DEMO.md

[DEMO.md](DEMO.md)'s beat 5 only covers opening a single program card for a prefilled draft — it
doesn't script the bulk **"Apply automatically"** button + consent + gap-fill flow (beat 6 above),
which is the more impressive multi-program moment. Fold beat 6 into DEMO.md's script directly if
this walkthrough's ordering is preferred over the source doc's.
