# ShopSmart — 3-minute demo script

**Before recording:** start the stack and seed the demo catalog:

```bash
docker compose up -d db
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open `http://localhost:3000` in a fresh browser profile (so a new session is created).
Keep a second tab ready at `http://localhost:3000/api/mcp/status`.

Say up front, honestly:

> "ShopSmart is a simulated Alexa+-style web experience for this hackathon. It talks to a real, self-hosted MCP server over Streamable HTTP. The products are real, with real retailer links; prices are a clearly labeled snapshot captured on 21 October 2026, not live pricing, and there is no real Alexa+ device connection. And ShopSmart never purchases anything."

---

### 0:00–0:30 — The problem and the shopping brief

Click **Load demo brief**, then **Send**. The brief says:

> "I need a reliable 1 TB internal SSD for a laptop that supports a 2.5-inch SATA drive. My budget is up to ₹30,000. Compare options from approved Indian retailers, prioritize reliable products and warranty, and flag compatibility or seller details you cannot verify."

Point at the **Criteria ledger** on the right:

> "The brief becomes a structured ledger. HARD constraints — at least 1000 GB, 2.5-inch form factor, SATA interface, laptop-bay compatibility, budget up to ₹30,000 — must be satisfied. SOFT preferences like warranty only rank products *after* hard constraints pass. Delivery charges and tax breakdown are listed as UNVERIFIABLE instead of being invented. Prices are a dated snapshot of real retailer listings (captured 21 Oct 2026), not live pricing — the cards say so, with the real Amazon.in/Flipkart product link on each one."

### 0:30–1:15 — Search, MCP tool calls, and evidence-backed comparison

Point at the **MCP tool activity** panel:

> "These are actual MCP protocol calls, not stubbed JSON. One Streamable HTTP session ran `search_products`, then `verify_product_requirements` for each candidate, then `compare_products`. The status tab shows the handshake — initialize, tools/list with 13 tools, tools/call."

Scroll the product cards and the **Explainable comparison** table:

> "Every card is badged Snapshot data with its real retailer link and verification date. The comparison shows known price, form factor, interface, capacity, warranty — and the hard-requirement verdict per product, with the evidence behind each satisfied or violated constraint."

### 1:15–1:45 — A rejected candidate and an uncertain candidate

Point at the **Kingston NV2 1TB NVMe** card (badge: fail):

> "This one is rejected, openly. It's cheaper, but it's an M.2 NVMe drive — it violates the form-factor, interface, and laptop-bay hard constraints, so it can never be ranked as a recommendation."

Expand **Show evidence** on the **GenericPro Ultra 1TB** card:

> "This listing is uncertain. Its interface is listed as 'unknown' and even conflicts between sources, warranty is Unknown, and several fields are missing. ShopSmart surfaces that as Unknown — it does not fill gaps with guesses, and unknown delivery or tax costs are never treated as zero."

### 1:45–2:30 — Propose, cart unchanged, explicit confirmation, cart update

On the **Crucial MX500** card (a passing product), click **Shortlist**, then **Propose cart**.

The consent dialog opens. Read what it shows:

> "The proposal names the exact product and ID, variant 1TB, quantity 1, unit price ₹7,299, retailer and source link, the pending-action ID, its expiry, and the costs that are still unknown."

Point at the header — it still says **Cart (0)**:

> "Proposing changed nothing. The server created a pending consent action; the cart is untouched until I explicitly approve this exact proposal."

Click **Approve add to ShopSmart cart**. The cart drawer opens:

> "Only now — after explicit confirmation of that exact, unexpired proposal — the cart updates: one Crucial MX500, known subtotal ₹7,299, with delivery and taxes still flagged unknown. If I replayed that same confirmation, it would be rejected as already consumed; a bare 'yes' in chat is also not accepted as confirmation."

### 2:30–3:00 — ShopSmart never purchases

In the cart, click **Open retailer link** on the Crucial MX500.

> "That's the buy path — you finish on the retailer site. ShopSmart never places the order or takes payment."

In chat, type: **"Buy the Crucial SSD now, checkout and submit my payment immediately"** and Send.

> "ShopSmart refuses. There is no checkout or payment tool. Open the retailer link yourself."

Close on the tagline:

> "ShopSmart: compare with evidence, cart with consent — never purchase on your behalf."

---

## If asked: show the actual MCP invocation

The UI's tool trace is backed by real protocol traffic. Equivalent raw call (after an `initialize` handshake that returns an `Mcp-Session-Id`):

```bash
curl -X POST http://127.0.0.1:3101/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <session-id-from-initialize>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_cart_add","arguments":{"sessionId":"<shopsmart-session-id>","productId":"ssd-crucial-mx500-1tb","quantity":1}}}'
```

Result (abridged): a pending action with `pendingActionId`, the fingerprinted product/variant/price snapshot, and `expiresAt` — while `get_cart` still returns zero items until `confirm_cart_add` is called with `approved: true` for that exact pending action.
