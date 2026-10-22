import { createHash } from "node:crypto";

export function fingerprintParts(parts: Array<string | number | null | undefined>): string {
  return createHash("sha256")
    .update(parts.map((p) => (p == null ? "" : String(p))).join("|"))
    .digest("hex");
}

/**
 * Binds consent to the exact proposed action. Any material change
 * (price, variant, retailer, source, quantity, product, session,
 * action type, target cart item) changes the fingerprint.
 */
export function fingerprintConsent(input: {
  sessionId: string;
  productId: string;
  variant: string | null | undefined;
  quantity: number;
  unitPriceInr: number;
  actionType?: string;
  retailer?: string | null;
  sourceUrl?: string | null;
  cartItemId?: string | null;
  targetQuantity?: number | null;
}): string {
  return fingerprintParts([
    input.actionType ?? "CART_ADD",
    input.sessionId,
    input.productId,
    input.variant ?? "",
    input.quantity,
    input.unitPriceInr,
    input.retailer ?? "",
    input.sourceUrl ?? "",
    input.cartItemId ?? "",
    input.targetQuantity ?? "",
  ]);
}
