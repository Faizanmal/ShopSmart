# MCP integration — what is real vs demo

## Real (genuinely integrated)

| Piece | Implementation |
| --- | --- |
| Transport | Streamable HTTP (`@modelcontextprotocol/sdk` v1.x, MCP spec **2025-11-25**) |
| Server | `mcp-server/index.ts` — Express + `StreamableHTTPServerTransport` + `McpServer` |
| Client | `src/lib/mcp/client.ts` — `Client` + `StreamableHTTPClientTransport` |
| Handshake | `client.connect` performs initialize; app calls `listTools` / `callTool` |
| Tools (13) | `search_products`, `get_product_details`, `verify_product_requirements`, `compare_products`, `manage_shortlist`, `propose_cart_add`, `confirm_cart_add`, `propose_cart_update`, `propose_cart_remove`, `confirm_cart_change`, `get_cart`, `update_cart_item` / `remove_cart_item` (proposal-only aliases) |
| Shopping UI | Chat agent and research evaluate / catalog search facades invoke **MCP tools**; they do not return hard-coded product JSON |
| Consent | Server-side in `propose_cart_add` / `confirm_cart_add` handlers (DB pending actions) |
| Orchestration | Deterministic tool planner by default; optional OpenAI (`LLM_PROVIDER=openai`) or Amazon Bedrock Converse (`LLM_PROVIDER=bedrock`, `src/lib/agent/bedrock.ts`) tool-calling over the same MCP tools |

## Demo default vs live mode

| Piece | Reality |
| --- | --- |
| Product catalog (default) | Seeded PostgreSQL snapshot (`dataProvider: DEMO`) — real products/links, prices captured 2026-10-21, labelled "Snapshot data", not live pricing |
| Live mode (optional) | `PRODUCT_PROVIDER=live` + `SERPAPI_API_KEY` → real-time Amazon.in listings via SerpApi (`dataProvider: LIVE`, badged "Live data"); without a key it falls back to the snapshot with a warning |
| Delivery / tax (live mode) | Unknown unless the listing states it — never invented |
| Images | Snapshot mode: stock photos for UI only. Live mode: retailer images from the listing |
| Alexa+ device | Simulated Alexa+-style web experience (the hackathon's simulated path) — no physical Alexa+ device, skill, or gated partner tooling connected |

## HTTP routes vs MCP

Routes such as `/api/catalog/search` and `/api/research/evaluate` are **thin facades**. Their handlers call `mcpCallTool` / `withMcpSession` and return those tool results. They are not a substitute MCP server.

Full HTTP route inventory (all product data flows through MCP tools):

| Route | Purpose | MCP tools used |
| --- | --- | --- |
| `GET /api/catalog/search` | Catalog search facade | `search_products` |
| `POST /api/research/evaluate` | Verify/compare facade | `get_product_details` / `search_products` → `verify_product_requirements` → `compare_products` |
| `POST /api/chat` | Agent (deterministic or LLM orchestration) | Session-scoped tool sequence |
| `POST /api/mcp/tool` | Generic tool proxy (used by the UI for `manage_shortlist`) | **Allowlist only** — see below |
| `POST /api/cart/confirm` | **The only HTTP confirmation path** (ConsentDialog) | `confirm_cart_add` → `get_cart` |
| `GET /api/mcp/status` | Handshake + tool list for the UI badge | `initialize` + `tools/list` |
| `POST/GET /api/sessions`, `DELETE /api/brief/criterion` | Session/ledger persistence (Postgres, no MCP) | — |

`/api/mcp/tool` enforces a server-side allowlist (`HTTP_PROXY_ALLOWED_TOOLS` in `src/lib/mcp/httpProxyAllowlist.ts`, enforced in `src/app/api/mcp/tool/route.ts`): read, propose, shortlist, and cart-read tools are callable, but **`confirm_cart_add` / `confirm_cart_change` and any purchase/checkout name are rejected with 403** — over HTTP, confirmation must go through `/api/cart/confirm`. Direct MCP-protocol clients can still call confirm tools; that trusted-client surface is disclosed in `docs/KNOWN_LIMITATIONS.md`. Regression coverage: `tests/mcpToolProxy.test.ts`.

## Local verification

```bash
npm run dev
curl http://127.0.0.1:3101/health
curl http://localhost:3000/api/mcp/status
npm test -- tests/mcp.integration.test.ts
```
