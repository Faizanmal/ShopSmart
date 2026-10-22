# ShopSmart — Project Description

**Compare with evidence. Cart with consent. Never purchase on your behalf.**

## The problem

Online shopping assistants usually optimize for speed to checkout: they summarize listings into confident recommendations, quietly drop constraints that are hard to satisfy, fill missing facts with plausible guesses, and treat "yes" in a chat as permission to act. For purchases where compatibility and constraints actually matter — a drive that must physically fit a laptop bay, a part that must match an interface, a hard budget ceiling — that behavior produces wrong, unverifiable, and sometimes irreversible outcomes.

ShopSmart explores the opposite contract: **hard constraints are enforced in code, every important claim carries evidence or is labeled Unknown, and the assistant can never purchase anything.** Adding to its planning cart requires an explicit, exact, expiring confirmation that the model itself cannot grant.

## Intended users

- Shoppers upgrading or buying technical products (the demo scenario is a 1TB 2.5-inch SATA SSD for a laptop, priced in INR for Indian retailers) who need compatibility certainty, not marketing copy.
- Cautious buyers who want an assistant to research and organize options while they keep final control of any commitment.
- Hackathon reviewers evaluating safe agent/tool design: evidence surfacing, consent-bound tool use, and honest handling of unknown data.

## What ShopSmart does

1. **Brief → criteria ledger.** A natural-language brief becomes a structured, visible ledger: HARD constraints, SOFT preferences, MISSING information, and UNVERIFIABLE fields. Hard constraints are never silently relaxed; missing facts stay missing.
2. **Evidence-backed research.** Products return with structured specs, source links, provider labels, conflicting/missing field flags, and verification timestamps. Every important claim is classified as verified, provider claim, or Unknown.
3. **Constraint verification.** Each candidate is checked against the ledger. Violations (wrong form factor, wrong interface, under capacity, over budget) fail openly on the card and in the comparison — never hidden behind a recommendation score.
4. **Explainable comparison.** Side-by-side table with known prices, specs, warranty, per-constraint verdicts with evidence, and explicit unknowns. Unknown delivery/tax costs are not treated as zero.
5. **Consent-bound planning cart.** `propose_cart_add` creates a pending, fingerprinted, expiring server-side action and **does not change the cart**. Only `confirm_cart_add` with explicit approval of that exact proposal (same session, unexpired, product/variant/quantity/price/retailer unchanged) mutates the cart — exactly once. Replayed, expired, cross-session, stale-priced, or ambiguous ("yes"/"ok") confirmations are rejected. Immediate purchase/checkout/payment requests are refused: no such tool or endpoint exists.
6. **Session memory.** Brief, ledger, shortlist, cart, and conversation persist in PostgreSQL and survive refresh.

## Differentiating features

- **Constraint-first, not score-first:** hard violations disqualify before any ranking; soft preferences only order the survivors.
- **Uncertainty as a first-class output:** unknown, missing, and conflicting fields are displayed, not smoothed over.
- **Server-enforced consent, not prompt-enforced:** the consent state machine lives in the MCP tool layer with atomic single-use consumption; the LLM (when enabled) is blocked from calling confirm tools at all.
- **Real MCP, honestly scoped:** a self-hosted MCP server (Streamable HTTP, spec 2025-11-25) with 13 tools; the web UI is a genuine MCP client (initialize → tools/list → tools/call), including single-session search→verify→compare orchestration.
- **Works with zero API keys:** a deterministic orchestrator performs the full journey; an LLM is optional.

## Architecture

| Process | Port | Role |
| --- | --- | --- |
| Next.js web app (App Router, React, TypeScript, Tailwind) | 3000 | UI + API routes + real MCP client |
| MCP server (Express + `@modelcontextprotocol/sdk`) | 3101 | 13 Streamable HTTP tools; stateful sessions |
| PostgreSQL (Prisma) | 5433→5432 locally | Sessions, briefs/criteria, products, shortlist, cart, pending consent actions, audit events |

Domain logic (brief parsing, verification, comparison, consent) is shared TypeScript under `src/lib/`; the MCP server executes tools against it. Deployment requires a long-running MCP process (not serverless) and a single MCP replica (in-memory protocol sessions). Full guidance: `docs/DEPLOYMENT.md`.

## MCP implementation

- Transport: Streamable HTTP with `enableJsonResponse`, per-session transports, Origin allowlist, `/health` endpoint.
- Tools: `search_products`, `get_product_details`, `verify_product_requirements`, `compare_products`, `manage_shortlist`, `propose_cart_add`, `confirm_cart_add`, `propose_cart_update`, `propose_cart_remove`, `confirm_cart_change`, `get_cart`, plus proposal-only aliases `update_cart_item` / `remove_cart_item`.
- Deliberately absent: any checkout, purchase, payment, or order tool. Tests assert unknown tools (including `checkout`) are rejected.

## Setup (verified)

```bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
docker compose up -d db
npx prisma migrate deploy
npm run db:seed
npm run dev                 # web :3000 + MCP :3101
```

Open http://localhost:3000, click **Load demo brief** → **Send**. A three-minute walkthrough is in `docs/DEMO_SCRIPT.md`. Docker Compose can also build/run the full stack (`docker compose up --build`); see `docs/DEPLOYMENT.md` for topology and manual steps.

## Tracks and mini-challenges

- **Primary track: Alexa+** — self-hosted MCP server (spec 2025-11-25, Streamable HTTP, official `@modelcontextprotocol/sdk`) plus a simulated Alexa+-style web experience that is a real MCP client. The MCP SDK is imported and called at runtime (`mcp-server/index.ts`, `src/lib/mcp/client.ts`).
- **Mini-challenge: AWS Builder** — Amazon Bedrock (Converse API with tool use) as an optional LLM orchestration provider over the same MCP tools (`LLM_PROVIDER=bedrock`, `src/lib/agent/bedrock.ts`). Deployment target is Amazon EC2 with an instance IAM role; step-by-step public deployment: `docs/DEPLOYMENT.md` (Option A). Note: Bedrock is code/type-verified with unit-tested fallback paths but was not live-tested against a real Bedrock account during development — on any Bedrock error the app falls back to deterministic orchestration (see `docs/KNOWN_LIMITATIONS.md`). Only claim this mini-challenge in the Devpost form if the EC2 + Bedrock deployment is live at submission time.
- **Mini-challenge: Open Source** — this repository is public under the MIT license. (Devpost describes this as a new, *additional* open-source project/contribution alongside the primary track — if the organizers do not count the primary repo itself, enter this only with a separate repo/PR and add its URL, your GitHub username, and a short description in the Devpost form.)

## Product feedback (tools / APIs / SDKs used)

- **Model Context Protocol (TypeScript SDK, Streamable HTTP)** — used for the self-hosted MCP server and the web app's MCP client. *Worked well:* the official SDK's client/server pair interoperated exactly as documented; `initialize` → `tools/list` → `tools/call` with JSON-response mode was straightforward, and Zod-validated tool schemas caught bad arguments early. *Needs work:* session lifecycle is entirely the host's problem (transports live in memory; restarts drop protocol sessions), and there is no built-in auth story for the MCP endpoint — we added Origin allowlisting and kept the port private. *Onboarding:* zero-to-hello-world was fast with the official docs; the stateful-vs-serverless deployment constraint only became obvious later and deserves an earlier, louder warning in the docs. *Would build again:* yes — MCP made the consent boundary enforceable in one place (the tool layer) instead of in prompts.
- **Amazon Bedrock (Converse API, `@aws-sdk/client-bedrock-runtime`)** — optional model orchestration over the MCP tools. *Worked well:* Converse tool-use maps cleanly onto MCP tool schemas; the AWS SDK credential chain (EC2 instance role) removes key management. *Needs work:* per-account model-access enablement and inference-profile availability vary by region and were the least discoverable part; clear pre-flight errors would help. *Onboarding:* moderate — IAM + model access + region/model selection before the first successful call. *Would build again:* yes, with the deterministic fallback kept — Bedrock failure must never break shopping.
- **Next.js / React / Prisma / PostgreSQL** — web app, API routes, persistence. Worked well overall; Prisma transactions made the exactly-once consent claim (`PENDING → CONSUMED`) a few lines of code.

### Friction log (selected)

1. **Task:** confirm a cart quantity change from the web UI. **Expected:** the consent dialog confirms `CART_UPDATE` proposals like it does adds. **Actual:** the HTTP confirm route hard-coded `confirm_cart_add`, so update/remove proposals could never be confirmed via the UI (backend/MCP worked; UI path failed). **Severity:** high (broken core flow, hidden because MCP-level tests passed). **Workaround/fix:** route now calls `confirm_cart_change`, which validates any pending cart action server-side; verified live end-to-end. **Suggestion:** consent endpoints should be typed by action type end-to-end so a mismatched confirm target fails at compile time, not in manual testing.
2. **Task:** refine a shopping brief across turns ("change my budget", "exclude Samsung"). **Expected:** merge into the existing criteria ledger. **Actual:** each new brief replaced the ledger, silently deleting unrelated hard constraints. **Severity:** high (violates the product's core promise). **Fix:** criteria merge semantics + refinement detection, with regression tests; verified live. **Suggestion:** agent frameworks should treat accumulated user constraints as durable state with explicit merge/replace semantics, not as per-turn prompt text.
3. **Task:** run the MCP server on serverless hosting. **Expected:** deploy like a normal API. **Actual:** Streamable HTTP transports are stateful in memory; serverless is not viable. **Severity:** medium. **Workaround:** persistent EC2 + Docker Compose host. **Suggestion:** MCP hosting docs should lead with the statefulness constraint and sticky-session/external-session-store patterns.

## Verified capabilities (actually executed, 2026-10-22)

- **81/81 Vitest tests pass**: brief parsing (including budgets written without a ₹ symbol, e.g. "7000-10000 rupees"), requirement verification, catalog claims, criteria-refinement merging, consent state machine (propose-no-mutate, confirm-once, replay/expired/cross-session/stale-snapshot rejection, concurrent-confirm exactly-once), MCP protocol integration, the HTTP-proxy confirm block (`/api/mcp/tool` cannot call confirm tools), the full 12-step journey, purchase-safety (including prompt-injection and purchase-refusal cases), resilience (missing LLM key, dead MCP server, malformed product data), and live-provider response-parsing fixtures. The suite is pinned to `PRODUCT_PROVIDER=demo` for determinism.
- **7/7 Playwright tests pass**: the complete browser journey (brief → ledger → evidence → shortlist → propose → cart still 0 → approve → cart 1 with updated subtotal → purchase attempt refused), refresh persistence, mobile layout (375px, no horizontal overflow), failed-network error surfacing, and MCP-offline badge.
- `npx tsc --noEmit` clean; clean-state database setup verified (fresh volume → 2 migrations → seed → app smoke test); Docker images for web and MCP build successfully.

## Honest limitations

- **Default catalog is a curated snapshot; live mode is real but quota-limited.** The default provider is nine listings of real products (eight SSDs and one HDD as a deliberate wrong-category candidate, plus one deliberately incomplete unbranded listing) with real model numbers, manufacturer specifications, and real Amazon.in ASIN / Flipkart item links; prices captured 2026-10-21 are labelled "Snapshot data" and are **not live pricing**. With `PRODUCT_PROVIDER=live` + a `SERPAPI_API_KEY`, search instead returns **real-time Amazon.in listings** (SerpApi Amazon engine: real ASIN links, live prices, retailer images, badged "Live data"; verified end-to-end locally, including propose→confirm on a live listing). Honest bounds: specs are parsed only from listing text the API returns, seller/delivery/tax stay Unknown, the SerpApi free tier allows 250 searches/month (one credit per search), and without a key live mode falls back to the snapshot with a warning. Stock photos are used for UI only in snapshot mode.
- **No real Alexa+ connectivity.** This is a simulated Alexa+-style web experience for the hackathon's simulated path — no physical Alexa+ device, Alexa skill, or Amazon partner tooling is connected. ShopSmart is not an official Amazon product.
- **Planning cart only.** ShopSmart never places orders, starts checkout, or submits payment; buying happens manually on the retailer's site.
- **No user authentication yet.** The session id is a bearer capability stored in `localStorage`; add auth before multi-user deployment.
- **Single-category demo depth.** The deterministic brief parser and catalog are tuned to the internal-SSD scenario; arbitrary categories parse less richly.
- **Infrastructure limits.** MCP sessions are in-memory (single replica; restart drops protocol sessions, not data); MCP port has Origin allowlisting but no auth and must stay on a private network.
- Docker was verified on the development machine (images build; `docker compose up` serves web + MCP + DB together). A separate clean-machine deployment is still a recommended manual check, and containers do not auto-run migrations/seed.

See `docs/KNOWN_LIMITATIONS.md` for the complete list.

## Built during the hackathon

ShopSmart was built during the Amazon Developer Hackathon 2026 submission window (October 2026) — MCP server, web client, consent state machine, catalog providers, tests, and deployment. No pre-existing ShopSmart product is being re-submitted; third-party libraries are listed in `package.json`.

## Feature requests (optional)

- **Alexa+ / MCP hosting guidance (important):** official patterns for stateful Streamable HTTP session stores / sticky sessions so MCP servers can scale beyond one in-memory replica.
- **MCP auth story (important):** a standard, documented auth approach for self-hosted MCP endpoints exposed to Alexa+-style clients.
- **Bedrock pre-flight (nice-to-have):** a single check that reports model access, region availability, and IAM permissions before the first Converse call.

---

## Submission checklist (remove before pasting into Devpost — for the team)

- [ ] Repo pushed to GitHub, public with MIT `LICENSE` — or private + shared with `testing@devpost.com` and collaborators `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar` added at submission time (invites expire in 7 days)
- [ ] Demo video < 3 min, public YouTube/Vimeo, in English (`docs/DEMO_SCRIPT.md`)
- [ ] Public demo URL live and unrestricted through judging (`docs/DEPLOYMENT.md` Option A), URL in testing instructions
- [ ] Devpost form: primary track **Alexa+**; mini-challenges selected only if live/eligible (AWS Builder = EC2+Bedrock actually running; Open Source = see note above)
- [ ] Product feedback + friction log pasted (sections above); no third-party trademarks/copyrighted music in the video
- [ ] Deadline: **Oct 23, 2026, 12:00pm PDT**
