import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/tool/route";
import { isHttpProxyToolAllowed } from "@/lib/mcp/httpProxyAllowlist";

function postTool(name: string) {
  return POST(
    new Request("http://localhost/api/mcp/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        args: { sessionId: "any", pendingActionId: "any", approved: true },
      }),
    }),
  );
}

describe("/api/mcp/tool HTTP proxy allowlist", () => {
  it("confirm_cart_add cannot be called via the generic HTTP proxy", async () => {
    const res = await postTool("confirm_cart_add");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; code?: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("tool_not_allowed_via_http_proxy");
  });

  it("confirm_cart_change cannot be called via the generic HTTP proxy", async () => {
    const res = await postTool("confirm_cart_change");
    expect(res.status).toBe(403);
  });

  it("purchase/checkout tool names are rejected by the proxy", async () => {
    for (const name of ["checkout", "purchase", "place_order"]) {
      const res = await postTool(name);
      expect(res.status).toBe(403);
    }
  });

  it("read / propose / shortlist tools remain proxy-callable", () => {
    for (const name of [
      "search_products",
      "get_product_details",
      "verify_product_requirements",
      "compare_products",
      "manage_shortlist",
      "propose_cart_add",
      "propose_cart_update",
      "propose_cart_remove",
      "get_cart",
      "update_cart_item",
      "remove_cart_item",
    ]) {
      expect(isHttpProxyToolAllowed(name)).toBe(true);
    }
    expect(isHttpProxyToolAllowed("confirm_cart_add")).toBe(false);
    expect(isHttpProxyToolAllowed("confirm_cart_change")).toBe(false);
  });
});
