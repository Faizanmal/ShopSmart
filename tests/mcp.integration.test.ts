import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  mcpCallTool,
  mcpInitializeAndListTools,
  withMcpSession,
} from "@/lib/mcp/client";
import { persistBrief } from "@/lib/session/service";
import { parseShoppingBrief } from "@/lib/criteria/parseBrief";

const prisma = new PrismaClient();
const mcpUrl = process.env.MCP_SERVER_URL ?? "http://127.0.0.1:3101/mcp";

async function mcpUp() {
  try {
    const health = mcpUrl.replace(/\/mcp$/, "/health");
    const res = await fetch(health);
    return res.ok;
  } catch {
    return false;
  }
}

const REQUIRED_TOOLS = [
  "search_products",
  "get_product_details",
  "verify_product_requirements",
  "compare_products",
  "manage_shortlist",
  "propose_cart_add",
  "confirm_cart_add",
  "propose_cart_update",
  "propose_cart_remove",
  "confirm_cart_change",
  "get_cart",
  "update_cart_item",
  "remove_cart_item",
];

describe("MCP protocol integration", () => {
  let sessionId: string;
  let available = false;

  beforeAll(async () => {
    available = await mcpUp();
    if (!available) return;
    const session = await prisma.shoppingSession.create({
      data: { title: "mcp-integration" },
    });
    sessionId = session.id;
  });

  it("initializes and lists required tools over Streamable HTTP", async ({ skip }) => {
    if (!available) skip();
    const info = await mcpInitializeAndListTools();
    expect(info.ok).toBe(true);
    expect(info.transport).toBe("streamable-http");
    expect(info.serverName).toBeTruthy();
    const names = info.tools.map((t) => t.name);
    for (const required of REQUIRED_TOOLS) {
      expect(names).toContain(required);
    }
    expect(names.some((n) => /checkout|purchase|payment|place_order/i.test(n))).toBe(
      false,
    );
  });

  it("search → details → verify → compare on one MCP session", async ({ skip }) => {
    if (!available) skip();

    const brief = parseShoppingBrief(
      "1 TB SSD 2.5-inch SATA laptop budget ₹7000-₹10000 reliable warranty",
    );
    await persistBrief(sessionId, brief);

    const flow = await withMcpSession(async (mcp) => {
      const search = await mcp.call("search_products", {
        sessionId,
        query: "SSD",
        category: "internal-ssd",
        limit: 8,
      });
      expect(search.ok).toBe(true);
      expect(search.viaMcp).toBe(true);
      const products = (search.result as { products: Array<{ id: string }>; dataProvider: string })
        .products;
      expect(products.length).toBeGreaterThanOrEqual(2);
      expect((search.result as { dataProvider: string }).dataProvider).toBe("DEMO");

      const firstId = products[0].id;
      const details = await mcp.call("get_product_details", {
        sessionId,
        productId: firstId,
      });
      expect(details.ok).toBe(true);
      expect((details.result as { product: { id: string } }).product.id).toBe(firstId);

      const verifications: Record<string, { overall: string }> = {};
      for (const p of products.slice(0, 6)) {
        const v = await mcp.call("verify_product_requirements", {
          sessionId,
          productId: p.id,
        });
        expect(v.ok).toBe(true);
        verifications[p.id] = v.result as { overall: string };
      }
      expect(Object.keys(verifications).length).toBeGreaterThanOrEqual(2);
      // At least one candidate should fail hard constraints in the seeded catalog.
      expect(
        Object.values(verifications).some((v) => v.overall === "fail"),
      ).toBe(true);

      const cmp = await mcp.call("compare_products", {
        sessionId,
        productIds: products.slice(0, 4).map((p) => p.id),
      });
      expect(cmp.ok).toBe(true);
      const comparison = (cmp.result as { comparison: unknown[] }).comparison;
      expect(Array.isArray(comparison)).toBe(true);
      expect(comparison.length).toBeGreaterThanOrEqual(2);

      return { products, verifications, comparison };
    });

    expect(flow.comparison.length).toBeGreaterThanOrEqual(2);
  });

  it("propose does not mutate; confirm adds once via MCP", async ({ skip }) => {
    if (!available) skip();
    const search = await mcpCallTool("search_products", {
      sessionId,
      query: "SSD",
      category: "internal-ssd",
      limit: 5,
    });
    expect(search.ok).toBe(true);
    const products = (search.result as { products: Array<{ id: string }> }).products;
    const productId = products.find((p) => p.id.includes("crucial"))?.id ?? products[0].id;

    const propose = await mcpCallTool("propose_cart_add", {
      sessionId,
      productId,
      quantity: 1,
    });
    expect(propose.ok).toBe(true);
    expect(propose.viaMcp).toBe(true);
    const pendingActionId = (propose.result as { pendingActionId: string }).pendingActionId;

    const cartBefore = await mcpCallTool("get_cart", { sessionId });
    expect((cartBefore.result as { items: unknown[] }).items).toHaveLength(0);

    const confirm = await mcpCallTool("confirm_cart_add", {
      sessionId,
      pendingActionId,
      approved: true,
    });
    expect(confirm.ok).toBe(true);
    expect((confirm.result as { ok: boolean }).ok).toBe(true);

    const cartAfter = await mcpCallTool("get_cart", { sessionId });
    expect((cartAfter.result as { items: unknown[] }).items.length).toBeGreaterThan(0);

    const replay = await mcpCallTool("confirm_cart_add", {
      sessionId,
      pendingActionId,
      approved: true,
    });
    expect(replay.ok).toBe(true);
    expect((replay.result as { ok: boolean }).ok).toBe(false);
  });

  it("MCP update_cart_item is proposal-only; confirm_cart_change executes once", async ({ skip }) => {
    if (!available) skip();
    const s2 = await prisma.shoppingSession.create({ data: { title: "mcp-update-gate" } });
    const propose = await mcpCallTool("propose_cart_add", {
      sessionId: s2.id, productId: "ssd-crucial-mx500-1tb", quantity: 1,
    });
    const pid = (propose.result as { pendingActionId: string }).pendingActionId;
    await mcpCallTool("confirm_cart_add", { sessionId: s2.id, pendingActionId: pid, approved: true });
    const cart1 = await mcpCallTool("get_cart", { sessionId: s2.id });
    const item = (cart1.result as { items: Array<{ id: string; quantity: number }> }).items[0];
    expect(item.quantity).toBe(1);

    // Legacy name must now return a pending proposal, not mutate.
    const legacy = await mcpCallTool("update_cart_item", {
      sessionId: s2.id, cartItemId: item.id, quantity: 3,
    });
    expect(legacy.ok).toBe(true);
    expect((legacy.result as { pendingActionId?: string }).pendingActionId).toBeTruthy();
    const cart2 = await mcpCallTool("get_cart", { sessionId: s2.id });
    expect((cart2.result as { items: Array<{ quantity: number }> }).items[0].quantity).toBe(1);

    const conf = await mcpCallTool("confirm_cart_change", {
      sessionId: s2.id,
      pendingActionId: (legacy.result as { pendingActionId: string }).pendingActionId,
      approved: true,
    });
    expect((conf.result as { ok: boolean }).ok).toBe(true);
    const cart3 = await mcpCallTool("get_cart", { sessionId: s2.id });
    expect((cart3.result as { items: Array<{ quantity: number }> }).items[0].quantity).toBe(3);

    // Checkout-shaped tools must not exist.
    const tools = await mcpInitializeAndListTools();
    expect(tools.tools.map((t) => t.name)).not.toContain("checkout");
  });

  it("surfaces MCP tool errors without inventing success", async ({ skip }) => {
    if (!available) skip();
    const missing = await mcpCallTool("get_product_details", {
      sessionId,
      productId: "does-not-exist-xyz",
    });
    expect(missing.viaMcp).toBe(true);
    expect(missing.ok).toBe(false);
    expect(missing.error || JSON.stringify(missing.result)).toMatch(/not found/i);
  });
});
