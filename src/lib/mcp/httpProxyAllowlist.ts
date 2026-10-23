/**
 * Tools callable through the generic HTTP proxy POST /api/mcp/tool.
 *
 * Deliberately excludes the confirm tools: over HTTP, a cart confirmation
 * may only arrive via POST /api/cart/confirm (the ConsentDialog path, bound
 * to a specific pendingActionId). Without this restriction, any HTTP caller
 * holding a sessionId + pendingActionId could confirm through the proxy,
 * making it an undocumented second confirmation surface. Direct MCP
 * clients can still call confirm tools over the MCP protocol itself —
 * that trusted-client surface is disclosed in docs/KNOWN_LIMITATIONS.md.
 * Confirm tools stay excluded: over HTTP, confirmation is only via
 * POST /api/cart/confirm. Purchase/checkout/payment tool names do not
 * exist (no such MCP tools; the executor rejects unknown names).
 */
export const HTTP_PROXY_ALLOWED_TOOLS = new Set([
  "search_products",
  "get_product_details",
  "verify_product_requirements",
  "compare_products",
  "manage_shortlist",
  "propose_cart_add",
  "propose_cart_update",
  "propose_cart_remove",
  "get_cart",
  // Proposal-only aliases (never mutate directly).
  "update_cart_item",
  "remove_cart_item",
]);

export function isHttpProxyToolAllowed(name: string): boolean {
  return HTTP_PROXY_ALLOWED_TOOLS.has(name);
}
