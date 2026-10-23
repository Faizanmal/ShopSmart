# ShopSmart — Safety and Consent

## Purchase safety (enforced in backend code, not just prompts)

1. ShopSmart may search, inspect, compare, verify, shortlist, estimate totals, and manage **its own** planning cart.
2. Before any cart change, the UI shows exact product, variant, quantity, retailer/source, and known price, then requires explicit confirmation of a **specific pending action**.
3. Recommendations, general interest (“I like it”, “looks good”), and bare “yes/ok” never mutate the cart — in chat, only `confirm`/`approve …` phrases count (`src/lib/cart/confirmationIntent.ts`); the primary path is the ConsentDialog button.
4. Consent is bound by `payloadHash` to session, product, variant, quantity, unit price, action type, retailer, source URL, and (for edits) cart item + target quantity. Material changes → `stale_details`, pending cancelled, renewed approval required.
5. `PendingConsentAction` has a unique id + `expiresAt`. Confirmation atomically claims `PENDING → CONSUMED` (`updateMany` guarded by status + expiry) **inside the same transaction** as the cart mutation — concurrent/replayed confirmations add exactly once.
6. Cancel / denied (`approved !== true`) / ambiguous / expired / foreign-session / wrong-action-type / fabricated confirmations never mutate.
7. Cart **quantity updates and removals are also consent-gated**: `update_cart_item`/`remove_cart_item` now only create pending proposals; `confirm_cart_change` executes them.
8. No orders, payments, or retailer checkout automation. Buy by opening the retailer link yourself. No purchase/checkout/payment/order tools exist (tests assert the MCP executor rejects those names).
9. The LLM orchestrator **cannot call confirm tools at all** (`isLlmToolAllowed` in `src/lib/agent/llm.ts`); product descriptions/tool output are treated as untrusted data, so prompt injection cannot self-approve a cart change.
10. Never request or store payment credentials.
11. The generic HTTP proxy `/api/mcp/tool` cannot confirm cart changes: its server-side allowlist excludes `confirm_cart_add` / `confirm_cart_change` (403), so over HTTP the only confirmation path is the ConsentDialog's `POST /api/cart/confirm` with a specific `pendingActionId`. (Direct MCP-protocol clients remain a trusted-client surface — see `docs/KNOWN_LIMITATIONS.md`.)

## Consent state machine

```
[idle]
   │ propose_cart_add / propose_cart_update / propose_cart_remove
   ▼
[PENDING] ──expire──► [EXPIRED] (no cart change)
   │ confirm approved=true + session match + snapshot unchanged
   ▼ atomic claim
[CONSUMED] + cart mutation exactly once
   │ confirm again (seq. or concurrent)
   ▼
[rejected: already_consumed]
```

Mutation/consent evidence lives in `tests/consent.test.ts`,
`tests/purchaseSafety.test.ts`, and `tests/journey.test.ts`. Remaining
risk: session id is a bearer capability; no per-user auth in the
hackathon build (see `docs/KNOWN_LIMITATIONS.md`).

## Cart semantics

The cart is **ShopSmart’s planning cart**. UI copy must not claim items were added to Amazon, Flipkart, or any retailer cart. Ready-to-buy UX is a cart summary + manual retailer link.
