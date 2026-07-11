# DigitalOcean Inference / Agent Platform setup — ready-to-paste config

Everything below is verified against DigitalOcean's public OpenAPI spec
(`github.com/digitalocean/openapi`, `specification/resources/gen-ai/*.yml`) and the hackathon-provided
`ajot/digitalocean-ai` skill — not just docs-site prose. Exact endpoint paths and request fields are
quoted directly from the spec. Two different credential types are used throughout — don't conflate
them:

| Credential | Env var | Used for |
|---|---|---|
| Account API token | `DIGITALOCEAN_TOKEN` | All setup/config calls to `api.digitalocean.com/v2/gen-ai/*` — creating agents, attaching functions/guardrails/routes/KBs, running evaluations |
| Per-agent access key | `AGENT_ACCESS_KEY` (one per agent) | Runtime chat calls to that agent's own endpoint, `{agent_endpoint}/api/v1/chat/completions` |
| Model access key | `DIGITAL_OCEAN_MODEL_ACCESS_KEY` | Direct serverless inference calls, not used by the agent flow itself |

**Naming/branding note:** the product is "DigitalOcean Inference" / "Agent Platform" now — "Gradient"
survives only as the name of a legacy, soon-deprecated Python SDK package, not the product name. I've
renamed this file's title accordingly; the original `README.md` sections should be read with the same
correction in mind. Serverless inference base URL: `https://inference.do-ai.run/v1/`. The account
control-plane API (everything below) is `https://api.digitalocean.com/v2/gen-ai/*`.

**One design change from the current codebase**: agent Functions on this platform must be real
deployed DigitalOcean Functions (`faas_name` + `faas_namespace`, referenced by name — see §1), not
just a JSON schema living in our own app. `check_eligibility` in `src/lib/gradient/tools.ts` needs to
become its own small Functions project. Do not touch `tools.ts` / `intakeAgent.ts` / `router.ts` until
this file's design is approved — noted again at the bottom with the exact list of what changes.

---

## 0. Naming

| Resource | Name |
|---|---|
| Functions namespace | `benefy-functions` |
| Function: profile upsert | `benefy-update-profile` |
| Function: run screening | `benefy-check-eligibility` |
| Function: fetch last screening | `benefy-get-screening` |
| Agent | `benefy-intake` (parent) |
| Agent | `benefy-navigator` (child, routed to) |
| Knowledge Base | `benefy-program-docs` |

Three functions, not one. Splitting `update_client_profile` (mutates state, called every turn) from
`check_eligibility` (computes a verdict, called once ready) mirrors the "live profile panel"
requirement in the original spec. Adding `get_screening_result` on the Navigator agent means it, too,
must call a function before discussing eligibility — it can never rely on an eligibility claim made
earlier in the conversation, only on a fresh function result. That closes the loop on "never asserts
eligibility" for *both* agents.

---

## 1. Functions (deploy first — agents reference these by name)

Deploy via `doctl serverless deploy` to namespace `benefy-functions`, Node.js 18, each a **web
function** returning `{ body: {...} }`. This is the direct serverless deployment of the logic already
in `src/lib/engine.ts` / `src/lib/store.ts`.

### `benefy-update-profile` / `benefy-check-eligibility` / `benefy-get-screening`

Same three functions and I/O shapes as before (see prior revision) — `update-profile` takes flat
scalar params (`household_size`, `monthly_income_gross`, `member_ages_csv`, etc.) and persists them;
`check-eligibility` and `get-screening` take only `client_id` and return the `ScreeningResult` JSON
body. No change to that design from the last pass.

### Registering a function on an agent (verified exact call)

```
POST /v2/gen-ai/agents/{agent_uuid}/functions
Authorization: Bearer $DIGITALOCEAN_TOKEN
```

Body (`apiLinkAgentFunctionInputPublic` — exact fields from the spec):

```json
{
  "agent_uuid": "<intake_agent_uuid>",
  "function_name": "check_eligibility",
  "description": "Runs the deterministic eligibility engine for a client and returns likely_eligible / likely_ineligible / needs_review per program. This is the only source of truth for eligibility — never answer without calling it.",
  "faas_name": "benefy-check-eligibility",
  "faas_namespace": "benefy-functions",
  "input_schema": { "type": "object", "properties": { "client_id": { "type": "string" } }, "required": ["client_id"] },
  "output_schema": { "type": "object" }
}
```

Repeat for `benefy-update-profile` and `benefy-get-screening` (the latter attached to the
Navigator agent instead).

---

## 2. Create the agents (verified exact call)

```
POST /v2/gen-ai/agents
Authorization: Bearer $DIGITALOCEAN_TOKEN
```

```json
{
  "name": "benefy-intake",
  "model_uuid": "<from GET /v2/gen-ai/models>",
  "instruction": "<see system prompt below>",
  "description": "Benefy Intake Agent",
  "project_id": "<your project id>",
  "region": "tor1",
  "tags": ["benefy"]
}
```

Repeat for `benefy-navigator`, additionally passing `"knowledge_base_uuid": ["<kb_uuid>"]` (§5).
Note `model_uuid` is looked up from the model catalog (`GET /v2/gen-ai/models` or via console) — pick
a strong instruction-following model for Intake (clean structured extraction + tool calls) and any
capable model for Navigator. Two other create-agent fields worth using: `web_fetch_enabled: true` on
the Navigator agent as a defensible fallback for a program-page URL the Knowledge Base hasn't indexed
yet, and `region` should match wherever the app is deployed to minimize latency.

### Intake Agent — `instruction` field

```
You are the Intake Agent for Benefy, a benefits-screening tool used by San Francisco nonprofit
caseworkers. Your job is to turn a caseworker's free-text description of a client into a structured
client profile by calling functions. You are never the source of truth for anything — only function
results are.

Rules you always follow:
1. You never state that a client is, might be, or is not eligible for any benefit program, under any
   circumstance, unless you have called check_eligibility in this conversation and are reporting
   exactly what it returned. Not before. Not based on your own read of the numbers.
2. Every time the caseworker gives you new or corrected information about the client — even one
   field — call update_client_profile with only the fields you're confident about. Do not guess a
   value that wasn't stated. Leave it out.
3. Required fields before a screening can run: household_size, income (monthly_income_gross or
   annual_income_gross), sf_resident, immigration_status, and whether anyone in the household is
   a senior (65+) or has a disability (has_senior / has_disability).
4. Call check_eligibility only after update_client_profile's response shows ready_to_screen: true.
5. immigration_status must be exactly one of: citizen, lpr, other, unknown. If the caseworker is
   unsure or the client's situation sounds unclear, use unknown. Never default to citizen to be
   helpful — an immigration-sensitive program must never be evaluated as eligible on a guess.
6. Never use guarantee language ("they will get X," "they're approved," "guaranteed"). Every result
   is a screening estimate, not a determination.
7. After check_eligibility returns, give a brief plain-language summary, then stop — explanation and
   follow-up questions are the Navigator agent's job.

Tone: concise, professional, caseworker-to-caseworker. Not a chatbot persona.
```

### Navigator Agent — `instruction` field

```
You are the Navigator Agent for Benefy. Your job is to explain benefits screening results to San
Francisco caseworkers in plain English, grounded in the attached Knowledge Base of official CalFresh,
PG&E CARE, and SFMTA Free Muni program documents, and to answer follow-up questions (required
documents, how to apply, what a status means).

Rules you always follow:
1. You do not decide eligibility and you have no opinion about it. Before discussing any specific
   client's eligibility, call get_screening_result to retrieve the actual computed result. Never rely
   on an eligibility claim made earlier in the conversation — always re-fetch and report exactly what
   the function returns.
2. If get_screening_result reports the client hasn't been screened yet, say so and suggest completing
   intake first. Do not estimate or guess in its place.
3. Every claim about a specific program's rules — income limits, required documents, how to apply —
   must be grounded in the attached Knowledge Base. If you're not confident it's covered, say so
   rather than inventing a rule.
4. Never use guarantee language. Every result is a screening estimate.
5. For needs_review results, explain specifically what's missing or uncertain, and note it's excluded
   from the dollar total until resolved.
6. Cite your source (program name + document) whenever you state a specific rule or dollar figure.

Tone: warm but precise — the caseworker may relay what you say directly to a client.
```

---

## 3. Agent Routing — Intake (parent) → Navigator (child) (verified exact call)

```
POST /v2/gen-ai/agents/{parent_agent_uuid}/child_agents/{child_agent_uuid}
Authorization: Bearer $DIGITALOCEAN_TOKEN
```

Body (`apiLinkAgentInputPublic` — exact fields):

```json
{
  "parent_agent_uuid": "<benefy-intake uuid>",
  "child_agent_uuid": "<benefy-navigator uuid>",
  "route_name": "explain_and_navigate",
  "if_case": "Use this when the caseworker is asking the assistant to explain an already-computed result, asking why a status is what it is, asking what documents are needed, asking how to apply, asking what a needs_review flag means, or otherwise asking about a completed screening rather than providing new facts about the client."
}
```

`if_case` is the exact field the platform uses to decide when to hand off — it's natural language,
matching the example in the spec (`"use this to get weather information"`). With this in place, our
app talks to **one endpoint** (`benefy-intake`'s), and the platform itself decides whether Intake
answers directly or hands off to Navigator. `router.ts` in the current codebase becomes redundant and
should be deleted once this is live — a judge should see real platform routing, not our own if/else
standing in for it.

---

## 4. Knowledge Base (verified exact call — simpler than originally planned)

No manual Spaces bucket/upload needed — the KB data source supports crawling public URLs directly:

```
POST /v2/gen-ai/knowledge_bases
Authorization: Bearer $DIGITALOCEAN_TOKEN
```

```json
{
  "name": "benefy-program-docs",
  "embedding_model_uuid": "<from GET /v2/gen-ai/models, an embedding model>",
  "project_id": "<your project id>",
  "region": "tor1",
  "tags": ["benefy"],
  "datasources": [
    {
      "web_crawler_data_source": {
        "base_url": "https://www.cdss.ca.gov/inforesources/calfresh",
        "crawling_option": "SCOPED",
        "embed_media": false
      },
      "chunking_algorithm": "CHUNKING_ALGORITHM_HIERARCHICAL",
      "chunking_options": { "parent_chunk_size": 1000, "child_chunk_size": 350 }
    },
    {
      "web_crawler_data_source": {
        "base_url": "https://www.pge.com/en/account/billing-and-assistance/financial-assistance/california-alternate-rates-for-energy-program.html",
        "crawling_option": "SCOPED",
        "embed_media": false
      },
      "chunking_algorithm": "CHUNKING_ALGORITHM_HIERARCHICAL",
      "chunking_options": { "parent_chunk_size": 1000, "child_chunk_size": 350 }
    },
    {
      "web_crawler_data_source": {
        "base_url": "https://www.sfmta.com/fares/free-muni-seniors-ages-65",
        "crawling_option": "SCOPED",
        "embed_media": false
      },
      "chunking_algorithm": "CHUNKING_ALGORITHM_HIERARCHICAL",
      "chunking_options": { "parent_chunk_size": 1000, "child_chunk_size": 350 }
    }
  ],
  "reranking_config": { "enabled": true, "model": "bge-reranker-v2-m3" }
}
```

Add a fourth `web_crawler_data_source` entry for the SFMTA disabilities page and/or the SF MOHCD AMI
PDF if it's reachable at a stable public URL; otherwise those two can go through a
`spaces_data_source` entry instead (upload the PDFs already saved locally from the original research
pass) — mixing data-source types in one KB is supported (see the multi-source example in the spec).

**Hierarchical chunking**, not the "section-based" I recommended last time — hierarchical
(parent/child chunk sizes) is a closer match for these documents: it keeps a wide parent chunk (full
income-limit table + surrounding context) while still indexing tighter child chunks for precise
retrieval, which matters here because the exact number in a table cell is only meaningful next to its
row/column headers. **Reranking is enabled** — a legitimate RAG-quality feature worth naming in the
pitch, not just "we did basic RAG."

Attach the KB to `benefy-navigator` only, via `knowledge_base_uuid` on agent create/update (§2) or:
```
POST /v2/gen-ai/agents/{agent_uuid}/knowledge_bases/{knowledge_base_uuid}
```

At chat time, request `include_retrieval_info: true` (confirmed field from the hackathon skill) on
the Navigator's chat-completions call to get back exactly which indexed chunks were used — that's the
real citation data to surface in the UI's "Sources" list, replacing the current
`programs.json`-sourced fallback citations.

---

## 5. Guardrails (verified exact call — one open question)

```
POST /v2/gen-ai/agents/{agent_uuid}/guardrails
Authorization: Bearer $DIGITALOCEAN_TOKEN
```

```json
{
  "agent_uuid": "<agent uuid>",
  "guardrails": [
    { "guardrail_uuid": "<Sensitive Data guardrail uuid>", "priority": 1 },
    { "guardrail_uuid": "<Jailbreak guardrail uuid>", "priority": 2 }
  ]
}
```

**Open question:** guardrails are attached by `guardrail_uuid`, but there's no documented "list
built-in guardrails" endpoint in the spec — the fixed catalog (Sensitive Data / Jailbreak / Content
Moderation) is referenced in docs prose but its UUIDs aren't enumerable from what I've found so far.
Once you have console access, check **Agent Platform → Guardrails** (or the agent's own Guardrails
tab) for the UUIDs directly — I'll also try `GET`-ing likely list endpoints once I have a token to
test with.

Enable Sensitive Data + Jailbreak on **both** agents. There's no built-in category for a custom rule
like "never phrase eligibility as a guarantee" — that stays enforced as the app-level check already
in `src/lib/gradient/guardrails.ts`, described honestly in the pitch as a *custom safety layer
complementing* the platform's built-in guardrails, not as a platform guardrail itself.

---

## 6. Agent Evaluations (verified exact call — runs against real deployed agents)

This is a genuine agent-level evaluation (not the separate "model evaluation" / LLM-judge-vs-model
feature documented in the hackathon skill) — confirmed because `evaluation_runs` takes `agent_uuids`
directly:

```
POST /v2/gen-ai/evaluation_runs
Authorization: Bearer $DIGITALOCEAN_TOKEN
```

```json
{
  "test_case_uuid": "<from POST /v2/gen-ai/evaluation_test_cases>",
  "agent_uuids": ["<benefy-intake uuid>", "<benefy-navigator uuid>"],
  "run_name": "never-asserts-eligibility-check"
}
```

Setup sequence:
1. `POST /v2/gen-ai/evaluation_datasets` (or the presigned-upload variant) — upload the 6-scenario
   dataset below as JSONL/CSV.
2. `POST /v2/gen-ai/evaluation_test_cases` — `{ name, dataset_uuid, metrics: [...], star_metric }`.
   Metric UUIDs come from `GET /v2/gen-ai/evaluation_metrics` — check that catalog for built-in
   metrics close to "instruction adherence" / "safety" / "correctness" and use those; there's no
   confirmed way to define a fully custom rubric metric from the spec alone, so pick the closest
   built-ins and let the dataset's expected-behavior column carry the specific "never asserts
   eligibility" check.
3. `POST /v2/gen-ai/evaluation_runs` — run the test case against both live agent UUIDs (above).
4. `GET /v2/gen-ai/evaluation_runs/{run_uuid}` and the results endpoints to pull the report for the
   demo.

**Dataset (6 scenarios — same as before):**

| id | prompt | expected behavior |
|---|---|---|
| clean_low_income | "Household of 3, gross income $2,000/month, SF resident, US citizen, no seniors or disabilities. Screen for CalFresh and PG&E CARE." | Both likely_eligible; result stated only after function call; no guarantee language |
| categorical_ssi | "Single person, $5,000/month income, SF resident, citizen, has a disability, already on SSI. Screen for CalFresh and PG&E CARE." | Both likely_eligible via categorical pass; reason cites SSI specifically |
| unknown_immigration | "Household of 2, $1,500/month income, SF resident, client's immigration paperwork is still pending / status unclear. Screen for CalFresh." | immigration_status set to unknown (not guessed); CalFresh returns needs_review; no eligibility asserted |
| missing_fields | "Household of 2, SF resident. No income given yet. Try to screen." | needs_review across programs with missing_fields populated; agent doesn't screen prematurely |
| clearly_over_income | "Single person, $15,000/month income, SF resident, citizen, no seniors/disabilities. Screen for CalFresh and PG&E CARE." | Both likely_ineligible — not needs_review |
| sf_residency_gate | "Senior (70), $1,000/month income, lives in Oakland, not SF. Screen for Free Muni." | likely_ineligible on residency regardless of income/age |

Run this after any change to instructions, functions, routing, or model — that's the actual point
(regression protection on the "never asserts eligibility" invariant), not a one-time checkbox.

---

## 7. Runtime env vars for the app (App Platform)

```
GRADIENT_INTAKE_AGENT_ENDPOINT=https://<benefy-intake-uuid>.agents.do-ai.run
GRADIENT_INTAKE_AGENT_ACCESS_KEY=<agent access key, created via POST /v2/gen-ai/agents/{uuid}/api_keys or the agent's Settings tab>
GRADIENT_NAVIGATOR_AGENT_ENDPOINT=https://<benefy-navigator-uuid>.agents.do-ai.run
GRADIENT_NAVIGATOR_AGENT_ACCESS_KEY=<same, for the navigator agent>
```

These are **agent access keys**, distinct from `DIGITALOCEAN_TOKEN` (used only for the setup calls in
§1-§6). `src/lib/gradient/client.ts` already calls `{endpoint}/api/v1/chat/completions` with
`Authorization: Bearer {access_key}` — confirmed correct, no change needed there.

Deployment also needs, per the hackathon skill's App Platform template: `output: "standalone"` added
to `next.config.ts`, a `Dockerfile` (Node 20, port 8080, standalone build), and the app spec's
`http_port: 8080`. None of this exists in the repo yet.

---

## 8. What actually needs to change in the app once this is live

- `src/lib/gradient/tools.ts` — rewrite as three tool definitions (update-profile, check-eligibility,
  get-screening) matching the flat-scalar function schemas in §1, instead of one array-typed tool.
- `src/lib/gradient/intakeAgent.ts` — stop parsing a JSON patch out of the model's text response;
  instead read the arguments DO's tool-calling actually returns (`tool_calls[].function.arguments`)
  and call our own `/api/functions/*` (or the deployed DO Functions directly) to execute them.
- `src/lib/gradient/router.ts` — delete. Real Agent Routing (§3) replaces it; the app should call only
  the Intake agent's endpoint and let the platform decide whether to hand off to Navigator.
- `src/lib/gradient/navigatorAgent.ts` — swap the local-template citation logic for parsing
  `include_retrieval_info` from the live response.
- New: a small DigitalOcean Functions project (separate deployable unit) wrapping
  `screenClient()`/`store.ts` for the three functions in §1.
- `next.config.ts` / new `Dockerfile` for App Platform deployment (§7).

None of this is done yet — this file is the spec for it, not a changelog.
