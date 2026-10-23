# Known Limitations

## Product data

- Catalog is a **curated snapshot** (captured 2026-10-21; 9 listings: 8 SSDs + 1 HDD, the HDD a deliberate wrong-category candidate; one deliberately incomplete unbranded listing demonstrates unverifiable evidence). Products, model numbers (e.g. MZ-77E1T0BW, CT1000MX500SSD1), manufacturer specifications, and retailer links (real Amazon.in ASIN / Flipkart item pages) are real; every listing is badged **Snapshot data** in the UI with the capture date, and the schema mode stays `dataProvider: DEMO` (i.e. not a live feed).
- Prices are the snapshot values from the linked retailer/tracker pages at capture time — **not live pricing** (2026 SSD prices are volatile; one drive's marketplace price already conflicts across sources and is flagged `conflictingFields: [price]`). Verify price/availability on the retailer page before buying.
- **Live mode (optional):** with `PRODUCT_PROVIDER=live` + `SERPAPI_API_KEY`, search uses SerpApi's Amazon engine (`amazon.in`) and returns **real-time listings** (real ASIN links, live prices, retailer images; badged **Live data** in the UI). Specs are parsed only from text the API returns (capacity, form factor, interface) — anything the listing text does not state stays **Unknown**, and seller/delivery/tax remain Unknown. Fetched products are persisted with `dataProvider: LIVE` so verify/compare/consent work on them; demo (snapshot) search never returns live rows. SerpApi's free tier is **250 searches/month** and each brief/search consumes one credit — live mode is a demo enhancer, not a production data contract. Without a key, `live` falls back to the snapshot catalog with a warning. Flipkart has no equivalent live feed here.
- Product images are Unsplash stock photos for UI realism, not retailer-provided assets, prices, or inventory.
- Delivery estimates, tax breakdowns, and seller ratings are intentionally **Unknown** unless verified at capture time; unknown costs are never treated as zero.

## Alexa+ / Amazon

- The web UI is a **simulated Alexa+-style experience** built for the hackathon's simulated path.
- ShopSmart does **not** connect to a physical Alexa+ device, an Alexa skill endpoint, or gated Amazon partner tooling, and is not an official Amazon product.
- Voice input in the UI uses the browser's speech APIs where available; it is not Alexa voice processing.

## LLM

- Default orchestration is **deterministic MCP tool planning** (no API key required) and is the verified path.
- Optional: `LLM_PROVIDER=openai` + `OPENAI_API_KEY` enables OpenAI tool-calling over the same MCP tools. LLM failure falls back to deterministic orchestration.
- Optional: `LLM_PROVIDER=bedrock` enables **Amazon Bedrock** (Converse API with tool use, default model `amazon.nova-lite-v1:0`) over the same MCP tools — this is the AWS Builder integration. Credentials use the AWS SDK default chain (EC2 instance IAM role recommended). It has been code- and type-verified and its disabled/fallback paths are unit-tested, but it has **not yet been live-tested against a real Bedrock account**; on any Bedrock error it falls back to deterministic orchestration, so the demo cannot hard-fail on it.
- Cart authorization is never delegated to a model — only server-side `confirm_cart_add` / `confirm_cart_change` mutate the cart, and confirm tools are blocked for the LLM.

## Cart & consent

- The cart is ShopSmart's **planning cart only**. Buy by opening the retailer link yourself. No checkout, payment, or order-placement tools exist; purchase attempts in chat are refused.
- A direct MCP client can propose and confirm programmatically (both calls are required; propose alone never mutates). The explicit human confirmation step is enforced by the app/API contract and the pending-action state machine: session-bound, fingerprinted (product/variant/quantity/price/retailer/source), expiring (default 300s), single-use.
- The ShopSmart **session id is a bearer capability** (stored in browser `localStorage`). There is no per-user authentication yet — anyone with a session id can act on that session. Add auth before any multi-user deployment.

## Infrastructure

- The MCP server is a **stateful long-running process**: Streamable HTTP transports live in in-memory maps, so it cannot run on pure serverless hosting and cannot be horizontally replicated without sticky sessions or an external session store (not implemented).
- MCP protocol sessions are ephemeral (recreated after a server restart); durable shopping state survives because it is in PostgreSQL.
- Local Postgres is exposed on host port **5433** (container 5432) to avoid conflicts with other local Postgres installs.
- The MCP server binds `127.0.0.1` by default for local safety; containers set `MCP_HOST=0.0.0.0` on a private network. The MCP port has Origin allowlisting but **no user authentication** — do not expose it publicly.
- Docker Compose default DB credentials (`shopsmart`/`shopsmart`) are for local development only.

## Testing

- Verified 2026-10-22: **81/81 Vitest** (unit + consent/MCP integration + journey + purchase-safety + resilience + HTTP-proxy allowlist + live-provider parsing fixtures) and **7/7 Playwright** (desktop journey, refresh persistence, mobile, network-failure, MCP-offline), `tsc --noEmit` clean.
- The automated suite is **pinned to `PRODUCT_PROVIDER=demo`** for determinism: snapshot search is tokenized relevance (search is recall; verification enforces constraints) and is scoped to `dataProvider: DEMO` rows so live listings persisted during manual live testing can never leak into test runs.
- Tests need the local stack running (Postgres, web :3000, MCP :3101) and are sensitive to the MCP dev server restarting mid-run.
- Playwright runs serially; parallel workers overload the local Next.js dev server on the development machine.
- Docker images for `web` and `mcp` build successfully, and the full three-container `docker compose up` was smoke-verified on the development machine (2026-10-20); re-validating on a separate clean machine is still recommended (see `docs/DEPLOYMENT.md`). Docker builds are slow on this machine (~13 min for both images).

## Product/UX gaps

- Criteria editing is removal-only in the ledger (plus refinement in chat — follow-ups like "exclude Samsung" or "change my budget to under ₹6,000" now merge into the existing ledger instead of replacing it; verified 2026-10-21); there is no inline budget editor yet.
- Claim rows are computed from current product data on each evaluation; they are not persisted as a historical claim trail on reload without a new evaluation.
- Broader accessibility pass (focus traps in dialogs/drawer, live regions) is still open.
- Catalog coverage is one demo category (internal SSDs) with a deterministic English brief parser tuned to it; arbitrary product categories are not parsed as richly.
- Cart quantity edit and removal are available in the cart drawer, each as a consent-gated pending action confirmed in the dialog (fixed 2026-10-21; the HTTP confirm route now uses `confirm_cart_change` so update/remove proposals can actually be confirmed).
