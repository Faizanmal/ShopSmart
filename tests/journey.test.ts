import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runShoppingAgent } from "@/lib/agent";
import { getSessionBundle } from "@/lib/session/service";
import { mcpCallTool, withMcpSession } from "@/lib/mcp/client";
import { isImmediatePurchaseAttempt } from "@/lib/cart/confirmationIntent";

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);
const mcpUrl = process.env.MCP_SERVER_URL ?? "http://127.0.0.1:3101/mcp";
const VALID = "ssd-crucial-mx500-1tb";
const BRIEF =
  "I need a reliable 1 TB internal SSD for a laptop that supports a 2.5-inch SATA drive. My budget is ₹7,000–₹10,000. Compare options from approved Indian retailers, prioritize reliable products and warranty, and flag compatibility or seller details you cannot verify.";

async function mcpUp() {
  try {
    return (await fetch(mcpUrl.replace(/\/mcp$/, "/health"))).ok;
  } catch {
    return false;
  }
}

describe.runIf(hasDb)("ShopSmart end-to-end journey (steps 1–12)", () => {
  let sessionId: string;
  let available = false;
  let pendingActionId: string;

  beforeAll(async () => {
    available = await mcpUp();
    const s = await prisma.shoppingSession.create({ data: { title: "journey-e2e" } });
    sessionId = s.id;
  });

  it("steps 1–4: brief → ledger → search → comparison with a hard-constraint failure", async ({ skip }) => {
    if (!available) skip();
    const res = await runShoppingAgent(sessionId, BRIEF);

    // 1–2: structured ledger persisted with budget + hard constraints
    const bundle = await getSessionBundle(sessionId);
    expect(bundle?.brief).toBeTruthy();
    expect(bundle?.brief?.budgetMinInr).toBe(7000);
    expect(bundle?.brief?.budgetMaxInr).toBe(10000);
    const kinds = new Set(bundle?.brief?.criteria.map((c) => c.kind));
    expect(kinds.has("HARD")).toBe(true);
    expect(kinds.has("SOFT")).toBe(true);
    expect(kinds.has("UNVERIFIABLE")).toBe(true);
    expect(
      bundle?.brief?.criteria.some((c) => c.kind === "HARD" && c.key === "compatibility"),
    ).toBe(true);

    // 3: real MCP search products, demo-labeled
    expect(res.mcpConnected).toBe(true);
    expect(res.products.length).toBeGreaterThanOrEqual(4);
    expect(res.dataProviderNotice).toMatch(/catalog snapshot/i);
    expect(res.toolTrace.some((t) => t.tool === "search_products" && t.ok)).toBe(true);

    // 4: comparison exists and at least one candidate fails a hard constraint
    const comparison = res.comparison as Array<{
      product: { id: string };
      verification: { overall: string };
    }>;
    expect(Array.isArray(comparison)).toBe(true);
    expect(comparison.length).toBeGreaterThanOrEqual(2);
    expect(comparison.some((c) => c.verification.overall === "fail")).toBe(true);
    const failing = comparison.find((c) => c.verification.overall === "fail")!;
    // NVMe, HDD, wrong-capacity, or over-budget (WD Blue SA510 at ₹17,499
    // vs the ₹10,000 hard budget) candidates are the seeded failures
    expect([
      "ssd-kingston-nv2-1tb-nvme",
      "ssd-samsung-990-pro-1tb",
      "ssd-sandisk-ssd-plus-500gb",
      "hdd-seagate-1tb-25",
      "ssd-wd-blue-1tb-sata",
    ]).toContain(failing.product.id);
    expect(res.verifications[failing.product.id]).toBeTruthy();
  });

  it("step 5: evidence exposes unknown / conflicting fields, never invents them", async ({ skip }) => {
    if (!available) skip();
    const details = await mcpCallTool("get_product_details", {
      sessionId,
      productId: "ssd-generic-1tb-unverified",
    });
    expect(details.ok).toBe(true);
    const product = (details.result as { product: Record<string, unknown> }).product as {
      conflictingFields: string[];
      missingFields: string[];
      claimRows: Array<{ key: string; status: string; value: string }>;
      warranty: string | null;
    };
    expect(product.conflictingFields).toContain("interface");
    expect(product.missingFields.length).toBeGreaterThan(0);
    expect(product.warranty == null).toBe(true);
    const unknowns = product.claimRows.filter((r) => r.status === "missing" || r.status === "unknown");
    expect(unknowns.length).toBeGreaterThan(0);
    expect(unknowns.every((r) => r.value === "Unknown")).toBe(true);
  });

  it("steps 6–10: shortlist → propose (cart unchanged) → confirm exact → added once, totals update", async ({ skip }) => {
    if (!available) skip();

    // 6: shortlist a valid product
    const shortlist = await mcpCallTool("manage_shortlist", {
      sessionId, action: "add", productId: VALID,
    });
    expect(shortlist.ok).toBe(true);
    const listed = await mcpCallTool("manage_shortlist", { sessionId, action: "list" });
    expect(JSON.stringify(listed.result)).toContain(VALID);

    // 7–8: propose; cart must remain empty
    const cartBefore = await mcpCallTool("get_cart", { sessionId });
    expect((cartBefore.result as { items: unknown[] }).items).toHaveLength(0);
    const propose = await mcpCallTool("propose_cart_add", {
      sessionId, productId: VALID, quantity: 1,
    });
    expect(propose.ok).toBe(true);
    pendingActionId = (propose.result as { pendingActionId: string }).pendingActionId;
    const proposal = (propose.result as { proposal: { unitPriceInr: number; productId: string } }).proposal;
    expect(proposal.productId).toBe(VALID);
    const cartAfterPropose = await mcpCallTool("get_cart", { sessionId });
    expect((cartAfterPropose.result as { items: unknown[] }).items).toHaveLength(0);

    // 9–10: confirm the exact proposal; item added once; totals update
    const confirm = await mcpCallTool("confirm_cart_add", {
      sessionId, pendingActionId, approved: true,
    });
    expect((confirm.result as { ok: boolean }).ok).toBe(true);
    const cart = await mcpCallTool("get_cart", { sessionId });
    const cartResult = cart.result as {
      items: Array<{ productId: string; quantity: number }>;
      knownSubtotalInr: number;
      unknownCosts: string[];
    };
    expect(cartResult.items).toHaveLength(1);
    expect(cartResult.items[0].productId).toBe(VALID);
    expect(cartResult.knownSubtotalInr).toBe(proposal.unitPriceInr);
    expect(cartResult.unknownCosts.length).toBeGreaterThan(0);
  });

  it("step 11: replayed, ambiguous and expired confirmations are rejected", async ({ skip }) => {
    if (!available) skip();

    // Replayed
    const replay = await mcpCallTool("confirm_cart_add", {
      sessionId, pendingActionId, approved: true,
    });
    expect((replay.result as { ok: boolean; code: string }).ok).toBe(false);
    expect((replay.result as { code: string }).code).toBe("already_consumed");

    // Ambiguous free-text via the agent must not add a second item
    const beforeQty = (
      (await mcpCallTool("get_cart", { sessionId })).result as {
        items: Array<{ quantity: number }>;
      }
    ).items[0].quantity;
    const amb = await runShoppingAgent(sessionId, "yes");
    expect(amb.assistantMessage).not.toMatch(/added to your ShopSmart planning cart/i);
    const afterAmb = (
      (await mcpCallTool("get_cart", { sessionId })).result as {
        items: Array<{ quantity: number }>;
      }
    ).items[0].quantity;
    expect(afterAmb).toBe(beforeQty);

    // Expired
    const p2 = await mcpCallTool("propose_cart_add", {
      sessionId, productId: VALID, quantity: 1,
    });
    const pid2 = (p2.result as { pendingActionId: string }).pendingActionId;
    await prisma.pendingConsentAction.update({
      where: { id: pid2 },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await mcpCallTool("confirm_cart_add", {
      sessionId, pendingActionId: pid2, approved: true,
    });
    expect((expired.result as { ok: boolean; code: string }).ok).toBe(false);
    expect((expired.result as { code: string }).code).toBe("expired");
    const cartQty = (
      (await mcpCallTool("get_cart", { sessionId })).result as {
        items: Array<{ quantity: number }>;
      }
    ).items[0].quantity;
    expect(cartQty).toBe(beforeQty);
  });

  it("step 12: immediate purchase request is refused — no purchase, checkout, or cart change", async ({ skip }) => {
    if (!available) skip();
    expect(isImmediatePurchaseAttempt("Buy it now and checkout")).toBe(true);
    expect(isImmediatePurchaseAttempt("I want to buy a laptop under ₹50,000")).toBe(false);

    const qtyBefore = (
      (await mcpCallTool("get_cart", { sessionId })).result as {
        items: Array<{ quantity: number }>;
      }
    ).items.reduce((a, i) => a + i.quantity, 0);

    const res = await runShoppingAgent(
      sessionId,
      "Buy the Crucial SSD now, checkout and submit my payment immediately",
    );
    expect(res.assistantMessage).toMatch(/can't purchase|never does that/i);
    expect(res.toolTrace.some((t) => /confirm|checkout|payment|order/.test(t.tool))).toBe(false);

    const cartAfter = await mcpCallTool("get_cart", { sessionId });
    const qtyAfter = (
      cartAfter.result as { items: Array<{ quantity: number }> }
    ).items.reduce((a, i) => a + i.quantity, 0);
    expect(qtyAfter).toBe(qtyBefore);
  });

  it("persistence: brief, shortlist and cart survive a fresh bundle read (refresh equivalent)", async () => {
    const bundle = await getSessionBundle(sessionId);
    expect(bundle?.brief?.criteria.length).toBeGreaterThan(0);
    expect(bundle?.shortlist.some((s) => s.productId === VALID)).toBe(true);
    expect(bundle?.cartItems.some((i) => i.productId === VALID)).toBe(true);
    expect(bundle?.turns.length).toBeGreaterThan(2);
  });

  it("single-session MCP flow: search→verify→compare share one handshake result set", async ({ skip }) => {
    if (!available) skip();
    const ids = await withMcpSession(async (mcp) => {
      const search = await mcp.call("search_products", {
        sessionId, query: "SSD", category: "internal-ssd", limit: 6,
      });
      const products = (search.result as { products: Array<{ id: string }> }).products;
      const v = await mcp.call("verify_product_requirements", {
        sessionId, productId: VALID,
      });
      expect(v.ok).toBe(true);
      const cmp = await mcp.call("compare_products", {
        sessionId, productIds: products.slice(0, 3).map((p) => p.id),
      });
      expect(cmp.ok).toBe(true);
      return products.map((p) => p.id);
    });
    expect(ids.length).toBeGreaterThanOrEqual(3);
  });
});
