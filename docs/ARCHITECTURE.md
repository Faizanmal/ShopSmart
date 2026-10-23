# ShopSmart — Architecture

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js App Router, React, TypeScript, Tailwind |
| MCP | `@modelcontextprotocol/sdk` (spec 2025-11-25), Streamable HTTP |
| MCP host | Express process (`mcp-server/`), long-running |
| Domain | Shared TypeScript modules under `src/lib/` |
| DB | PostgreSQL + Prisma |
| Validation | Zod |
| Tests | Vitest + Playwright |
| Local infra | Docker Compose (Postgres; optional full stack) |

## Process layout

```
Browser (ShopSmart UI)
    │  REST / Server Actions (session, chat, UI state)
    ▼
Next.js (port 3000)
    │  MCP client (Streamable HTTP)
    ▼
MCP Server (port 3101)  ──►  Domain services  ──►  Prisma  ──►  PostgreSQL
                              │
                              └── DemoCatalogProvider (default, curated snapshot)
                                  Optional LiveProductProvider (SerpApi Amazon.in, `src/lib/catalog/liveProvider.ts`)
```

The MCP server is a **separate Node process** so Streamable HTTP sessions and long-lived transports are not subject to serverless request limits.

## Domain modules

- `criteria/` — brief parsing, ledger model, hard/soft separation
- `catalog/` — provider interface + demo seed adapter
- `verify/` — constraint & compatibility checks
- `compare/` — deterministic ranking + trade-off summaries
- `cart/` — cart + pending consent (propose/confirm/expire/replay)
- `agent/` — deterministic tool orchestrator; optional LLM adapter
- `mcp/` — client helpers used by Next.js API routes
- `session/` — shopping session ownership & isolation

## Data model (summary)

- `ShoppingSession` — id, locale, currency, createdAt
- `ConversationTurn` — role, content, toolCalls JSON
- `ShoppingBrief` / `Criterion` — hard/soft/missing/unverifiable
- `Product` / `ProductSource` — catalog + evidence metadata
- `ShortlistItem`, `CartItem`
- `PendingConsentAction` — typed payload, hash, expiresAt, consumedAt
- `AuditEvent` — consent/cart mutations for debugging demos

Sessions are isolated: cart and pending actions are always scoped by `sessionId`.

## MCP tools

| Tool | Mutates? | Notes |
| --- | --- | --- |
| `search_products` | No | Demo or live provider |
| `get_product_details` | No | |
| `verify_product_requirements` | No | |
| `compare_products` | No | |
| `manage_shortlist` | Yes (shortlist) | add/remove/list |
| `propose_cart_add` | Creates pending only | |
| `confirm_cart_add` | Cart, if valid | Idempotent |
| `get_cart` | No | |
| `propose_cart_update` / `propose_cart_remove` | Creates pending only | Quantity change / removal proposals |
| `confirm_cart_change` | Cart, if valid | Executes a confirmed update/remove exactly once |
| `update_cart_item` / `remove_cart_item` | Creates pending only | Deprecated aliases of the propose tools — never mutate directly |

**Forbidden:** any purchase/checkout/payment/order tool. Buy via the retailer link only.

## Agent strategy

1. **Deterministic fallback (default):** rule-based brief extraction + fixed MCP tool sequence on one Streamable HTTP session. Works with zero LLM keys.
2. **Optional LLM:** `LLM_PROVIDER=openai` + `OPENAI_API_KEY` (OpenAI tool-calling) or `LLM_PROVIDER=bedrock` (Amazon Bedrock Converse API, `src/lib/agent/bedrock.ts`) against the live MCP tool list. Any LLM failure falls back to deterministic orchestration. Cart authorization remains server-enforced in `confirm_cart_add` / `confirm_cart_change` — the model cannot call confirm tools at all and cannot mutate the cart without server-side consent succeeding.

See [MCP_INTEGRATION.md](./MCP_INTEGRATION.md) for the real-vs-demo boundary.

## Deployment notes

- Run MCP server as a persistent container/process (not pure serverless).
- Next.js can be deployed separately; point `MCP_SERVER_URL` at the MCP host.
- Secrets only in server env; `.env.example` has placeholders only.
- Demo mode is the default and is labeled in UI and API responses (`dataProvider: "demo"`).

## Security highlights

- Origin validation on MCP Streamable HTTP endpoint.
- Session-scoped cart/consent checks.
- Pending action expiry + one-time consumption + payload fingerprint (product/variant/qty/price).
- No credential or payment storage.
