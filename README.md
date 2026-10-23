# ShopSmart

**Compare with evidence. Cart with consent. Never purchase on your behalf.**

ShopSmart is an AI shopping assistant for constraint-first product research with evidence-backed comparisons and an approval-controlled planning cart. Default locale: India (INR).

This project targets the Amazon AppDev 2026 **Alexa+** track with a self-hosted MCP server (spec **2025-11-25**, Streamable HTTP) and a web UI that acts as a **real MCP client**. It is a third-party hackathon product — not an official Amazon product and not connected to a physical Alexa+ device.

## Features

- Natural-language shopping brief → editable criteria ledger (hard / soft / missing / unverifiable)
- Curated catalog snapshot (real products, manufacturer specs, real Amazon.in/Flipkart links; prices captured 2026-10-21 and labelled as a snapshot, not live pricing) with evidence and verification timestamps — or optional **live mode** (`PRODUCT_PROVIDER=live` + `SERPAPI_API_KEY`) returning real-time Amazon.in listings
- Constraint & compatibility verification (violations are never hidden behind scores)
- Explainable side-by-side comparison
- Shortlist + multi-turn session memory
- Consent-bound cart: `propose_cart_add` never mutates; `confirm_cart_add` / `confirm_cart_change` validate pending actions
- Buy yourself via the retailer link on cards / cart — no checkout, payment, or order-placement tools
- Works without an LLM API key (deterministic orchestrator)

## Architecture (short)

| Process | Port | Role |
| --- | --- | --- |
| Next.js web app | 3000 | UI + API + **real MCP client** |
| MCP server | 3101 | Streamable HTTP tools (spec 2025-11-25) |
| PostgreSQL | 5433→5432 | Durable sessions, cart, consent |

Product search, verify, compare, shortlist, and cart propose/confirm all go through MCP `tools/call`. The catalog is a **curated snapshot of real products/links with dated prices** unless a live provider is configured.

See [docs/MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/SAFETY_AND_CONSENT.md](docs/SAFETY_AND_CONSENT.md).

## Prerequisites

- Node.js 20+ (tested with Node 22/26)
- npm 10+
- Docker Desktop (for PostgreSQL)

## Quick start

```bash
# 1) Install
npm install

# 2) Configure env
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env

# 3) Start Postgres
docker compose up -d db

# 4) Migrate + seed demo catalog
npx prisma migrate deploy
npm run db:seed

# 5) Run web + MCP together
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

MCP health: [http://127.0.0.1:3101/health](http://127.0.0.1:3101/health)  
MCP status via app: [http://localhost:3000/api/mcp/status](http://localhost:3000/api/mcp/status)

> Host Postgres port is **5433** to avoid conflicts with other local installs. Override in `.env` if needed.

### One-liner setup (when Docker is already running)

```bash
npm run setup
npm run dev
```

## Environment

Copy `.env.example`. Important keys:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection |
| `MCP_SERVER_URL` | MCP endpoint used by the web client |
| `MCP_ALLOWED_ORIGINS` | Origin allowlist for Streamable HTTP |
| `PENDING_CONSENT_TTL_SECONDS` | Pending cart consent expiry (default 300) |
| `PRODUCT_PROVIDER` | `demo` (default, curated snapshot). `live` + `SERPAPI_API_KEY` = real-time Amazon.in listings via SerpApi (free tier: 250 searches/month, one credit per search); without a key it falls back to the snapshot with a warning |
| `SERPAPI_API_KEY` | SerpApi key for live mode (never commit a real key) |
| `LLM_PROVIDER` | `none` (deterministic MCP orchestration), `openai` with `OPENAI_API_KEY`, or `bedrock` (Amazon Bedrock Converse API; AWS SDK credential chain / EC2 IAM role, `AWS_REGION`, `BEDROCK_MODEL_ID`). Cart consent stays server-side. |

Never commit real secrets.

## Demo walkthrough (≈3 minutes)

See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md). Short version:

1. Click **Load demo brief** → **Send**.
2. Inspect criteria ledger + snapshot-labeled product cards + MCP tool trace.
3. Select compatible SSDs → **Compare selected**.
4. **Propose cart** on a passing product → confirm in the dialog.
5. Open **Cart** — planning cart only; open retailer link manually. Replay confirm does nothing.

## MCP tools (13)

`search_products`, `get_product_details`, `verify_product_requirements`, `compare_products`, `manage_shortlist`, `propose_cart_add`, `confirm_cart_add`, `propose_cart_update`, `propose_cart_remove`, `confirm_cart_change`, `get_cart`, `update_cart_item` (proposal-only alias), `remove_cart_item` (proposal-only alias)

Forbidden by design: checkout / purchase / payment / place_order. Buy via the retailer link only.

## Tests

```bash
# Unit + integration (DB required for consent tests; MCP required for protocol tests)
npm test

# E2E (app + MCP + DB must be running; needs free disk for browser download)
npx playwright install chromium
npm run test:e2e
```

Latest verified results (2026-10-22): **81/81 Vitest, 7/7 Playwright, `tsc --noEmit` clean** (includes criteria-refinement merge, cart quantity/remove consent UI path, Bedrock provider guard tests, and live-provider parsing fixtures). The automated suite is pinned to `PRODUCT_PROVIDER=demo` for determinism.

## Docker full stack

```bash
docker compose up --build
```

Starts `db`, `mcp`, and `web`. For local iterative development, prefer `docker compose up -d db` + `npm run dev`.

## Deployment

The MCP server is a **stateful, long-running Node process** (Streamable HTTP sessions are held in memory), so it cannot run on pure serverless/function hosting. Deploy as containers or persistent services with PostgreSQL. Full guidance — including the recommended **Amazon EC2 + Docker Compose** public demo for judges (Bedrock via EC2 IAM role) — is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Hackathon submission (Amazon Developer Hackathon 2026 — Devpost)

- **Primary track: Alexa+** — self-hosted MCP server (spec 2025-11-25, Streamable HTTP, official `@modelcontextprotocol/sdk` in `mcp-server/index.ts`) + simulated Alexa+-style web experience that is a real MCP client (`src/lib/mcp/client.ts`).
- **Mini-challenges:** AWS Builder (Amazon Bedrock Converse, optional — see Deployment) and Open Source (this repo, MIT).
- **Devpost copy:** [submission/PROJECT_DESCRIPTION.md](submission/PROJECT_DESCRIPTION.md) (description, product feedback, friction log).
- **Demo video:** <3 min, public YouTube/Vimeo, following [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).
- **Repo access:** keep public (MIT), or if private, share with `testing@devpost.com` and add GitHub collaborators `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar` **at submission time** (invites expire in 7 days).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, processes, data model, MCP tools
- [docs/MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md) — what is real MCP vs demo/live data
- [docs/SAFETY_AND_CONSENT.md](docs/SAFETY_AND_CONSENT.md) — purchase-safety and consent state machine
- [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) — honest limits
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — local, EC2 (judges), and split-service deployment
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — 3-minute demo walkthrough
- [submission/PROJECT_DESCRIPTION.md](submission/PROJECT_DESCRIPTION.md) — Devpost submission text

## License

MIT — see [LICENSE](LICENSE).
