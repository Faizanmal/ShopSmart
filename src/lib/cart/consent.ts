import { ConsentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fingerprintConsent } from "@/lib/fingerprint";
import { getProductProvider } from "@/lib/catalog";
import type { ProductRecord } from "@/lib/catalog/types";

const TTL_SECONDS = Number(process.env.PENDING_CONSENT_TTL_SECONDS ?? 300);

export type CartActionType = "CART_ADD" | "CART_UPDATE" | "CART_REMOVE";

export type ProposeCartAddInput = {
  sessionId: string;
  productId: string;
  quantity: number;
  variant?: string | null;
};

export type ProposeCartAddResult =
  | {
      ok: true;
      pendingActionId: string;
      expiresAt: string;
      actionType: "CART_ADD";
      proposal: {
        productId: string;
        name: string;
        variant: string | null;
        quantity: number;
        unitPriceInr: number;
        estimatedSubtotalInr: number;
        retailer: string;
        sourceUrl: string;
        currency: "INR";
        unknownCosts: string[];
      };
      message: string;
    }
  | { ok: false; error: string; code?: string };

export type PendingProposalResult =
  | {
      ok: true;
      pendingActionId: string;
      expiresAt: string;
      actionType: CartActionType;
      proposal: {
        cartItemId?: string;
        productId: string;
        name?: string;
        variant: string | null;
        quantity: number;
        targetQuantity?: number;
        unitPriceInr: number;
        retailer: string;
        sourceUrl: string;
      };
      message: string;
    }
  | { ok: false; error: string; code?: string };

export type ConfirmCartAddInput = {
  sessionId: string;
  pendingActionId: string;
  approved: boolean;
};

export type ConfirmCartAddResult =
  | { ok: true; cartItemId: string; message: string }
  | { ok: false; error: string; code: string };

async function audit(
  sessionId: string,
  eventType: string,
  detail: Prisma.InputJsonValue,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? prisma;
  await client.auditEvent.create({ data: { sessionId, eventType, detail } });
}

function normalizeVariant(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function validQuantity(q: number): boolean {
  return Number.isInteger(q) && q >= 1 && q <= 20;
}

function expiresAt(): Date {
  return new Date(Date.now() + TTL_SECONDS * 1000);
}

// ---------------------------------------------------------------------------
// PROPOSE (never mutates cart)
// ---------------------------------------------------------------------------

export async function proposeCartAdd(
  input: ProposeCartAddInput,
): Promise<ProposeCartAddResult> {
  if (!validQuantity(input.quantity)) {
    return { ok: false, error: "Quantity must be an integer between 1 and 20.", code: "invalid_quantity" };
  }
  const session = await prisma.shoppingSession.findUnique({ where: { id: input.sessionId } });
  if (!session) return { ok: false, error: "Unknown shopping session.", code: "session_not_found" };

  const product = await getProductProvider().getById(input.productId);
  if (!product) return { ok: false, error: "Product not found.", code: "product_not_found" };

  const requestedVariant = normalizeVariant(input.variant);
  const catalogVariant = normalizeVariant(product.variant);
  if (requestedVariant && catalogVariant && requestedVariant !== catalogVariant) {
    return {
      ok: false,
      error: `Variant '${requestedVariant}' does not match catalog variant '${catalogVariant}' for this product.`,
      code: "variant_mismatch",
    };
  }
  const variant = requestedVariant ?? catalogVariant;

  const payloadHash = fingerprintConsent({
    actionType: "CART_ADD",
    sessionId: input.sessionId,
    productId: product.id,
    variant,
    quantity: input.quantity,
    unitPriceInr: product.priceInr,
    retailer: product.retailer,
    sourceUrl: product.sourceUrl,
  });

  const exp = expiresAt();
  const pending = await prisma.pendingConsentAction.create({
    data: {
      sessionId: input.sessionId,
      actionType: "CART_ADD",
      status: ConsentStatus.PENDING,
      productId: product.id,
      variant,
      quantity: input.quantity,
      unitPriceInr: product.priceInr,
      retailer: product.retailer,
      sourceUrl: product.sourceUrl,
      payloadHash,
      expiresAt: exp,
    },
  });

  await audit(input.sessionId, "cart.propose", {
    pendingActionId: pending.id,
    actionType: "CART_ADD",
    productId: product.id,
    variant,
    quantity: input.quantity,
    unitPriceInr: product.priceInr,
    retailer: product.retailer,
  });

  return {
    ok: true,
    pendingActionId: pending.id,
    expiresAt: exp.toISOString(),
    actionType: "CART_ADD",
    proposal: {
      productId: product.id,
      name: product.name,
      variant,
      quantity: input.quantity,
      unitPriceInr: product.priceInr,
      estimatedSubtotalInr: product.priceInr * input.quantity,
      retailer: product.retailer,
      sourceUrl: product.sourceUrl,
      currency: "INR",
      unknownCosts: ["delivery", "taxes_if_not_included", "seller_fees"],
    },
    message: "Pending cart addition created. Cart was NOT modified. Explicit confirmation is required.",
  };
}

export async function proposeCartUpdate(input: {
  sessionId: string;
  cartItemId: string;
  quantity: number;
}): Promise<PendingProposalResult> {
  if (!validQuantity(input.quantity)) {
    return { ok: false, error: "Quantity must be an integer between 1 and 20.", code: "invalid_quantity" };
  }
  const item = await prisma.cartItem.findFirst({
    where: { id: input.cartItemId, sessionId: input.sessionId },
    include: { product: true },
  });
  if (!item) return { ok: false, error: "Cart item not found in this session.", code: "cart_item_not_found" };
  if (item.quantity === input.quantity) {
    return { ok: false, error: "Quantity is unchanged; no confirmation action needed.", code: "no_change" };
  }
  const exp = expiresAt();
  const payloadHash = fingerprintConsent({
    actionType: "CART_UPDATE",
    sessionId: input.sessionId,
    productId: item.productId,
    variant: item.variant,
    quantity: item.quantity,
    targetQuantity: input.quantity,
    unitPriceInr: item.unitPriceInr,
    retailer: item.retailer,
    sourceUrl: item.sourceUrl,
    cartItemId: item.id,
  });
  const pending = await prisma.pendingConsentAction.create({
    data: {
      sessionId: input.sessionId,
      actionType: "CART_UPDATE",
      status: ConsentStatus.PENDING,
      productId: item.productId,
      variant: item.variant,
      quantity: item.quantity,
      targetQuantity: input.quantity,
      unitPriceInr: item.unitPriceInr,
      retailer: item.retailer,
      sourceUrl: item.sourceUrl,
      cartItemId: item.id,
      payloadHash,
      expiresAt: exp,
    },
  });
  await audit(input.sessionId, "cart.propose_update", {
    pendingActionId: pending.id, cartItemId: item.id, from: item.quantity, to: input.quantity,
  });
  return {
    ok: true,
    pendingActionId: pending.id,
    expiresAt: exp.toISOString(),
    actionType: "CART_UPDATE",
    proposal: {
      cartItemId: item.id, productId: item.productId, name: item.product.name,
      variant: item.variant, quantity: item.quantity, targetQuantity: input.quantity,
      unitPriceInr: item.unitPriceInr, retailer: item.retailer, sourceUrl: item.sourceUrl,
    },
    message: "Pending cart update created. Cart was NOT modified. Explicit confirmation is required.",
  };
}

export async function proposeCartRemove(input: {
  sessionId: string;
  cartItemId: string;
}): Promise<PendingProposalResult> {
  const item = await prisma.cartItem.findFirst({
    where: { id: input.cartItemId, sessionId: input.sessionId },
    include: { product: true },
  });
  if (!item) return { ok: false, error: "Cart item not found in this session.", code: "cart_item_not_found" };
  const exp = expiresAt();
  const payloadHash = fingerprintConsent({
    actionType: "CART_REMOVE",
    sessionId: input.sessionId,
    productId: item.productId,
    variant: item.variant,
    quantity: item.quantity,
    targetQuantity: 0,
    unitPriceInr: item.unitPriceInr,
    retailer: item.retailer,
    sourceUrl: item.sourceUrl,
    cartItemId: item.id,
  });
  const pending = await prisma.pendingConsentAction.create({
    data: {
      sessionId: input.sessionId,
      actionType: "CART_REMOVE",
      status: ConsentStatus.PENDING,
      productId: item.productId,
      variant: item.variant,
      quantity: item.quantity,
      targetQuantity: 0,
      unitPriceInr: item.unitPriceInr,
      retailer: item.retailer,
      sourceUrl: item.sourceUrl,
      cartItemId: item.id,
      payloadHash,
      expiresAt: exp,
    },
  });
  await audit(input.sessionId, "cart.propose_remove", {
    pendingActionId: pending.id, cartItemId: item.id,
  });
  return {
    ok: true,
    pendingActionId: pending.id,
    expiresAt: exp.toISOString(),
    actionType: "CART_REMOVE",
    proposal: {
      cartItemId: item.id, productId: item.productId, name: item.product.name,
      variant: item.variant, quantity: item.quantity, targetQuantity: 0,
      unitPriceInr: item.unitPriceInr, retailer: item.retailer, sourceUrl: item.sourceUrl,
    },
    message: "Pending cart removal created. Cart was NOT modified. Explicit confirmation is required.",
  };
}

// ---------------------------------------------------------------------------
// CONFIRM / CANCEL (the only cart-mutating entry point)
// ---------------------------------------------------------------------------

async function cancelPending(sessionId: string, pendingId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.pendingConsentAction.updateMany({
      where: { id: pendingId, sessionId, status: ConsentStatus.PENDING },
      data: { status: ConsentStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (claimed.count === 1) {
      await audit(sessionId, "cart.confirm_rejected", { pendingActionId: pendingId, reason }, tx);
    }
  });
}

export async function confirmPendingAction(
  input: ConfirmCartAddInput & { expectedType?: CartActionType | "ANY" },
): Promise<ConfirmCartAddResult> {
  // Deny / ambiguous (approved !== true strictly): never mutate.
  if (input.approved !== true) {
    // Only cancel if it belongs to this session; ignore foreign/missing silently.
    const pending = await prisma.pendingConsentAction.findFirst({
      where: { id: input.pendingActionId, sessionId: input.sessionId },
      select: { id: true, status: true },
    });
    if (pending?.status === ConsentStatus.PENDING) {
      await cancelPending(input.sessionId, pending.id, "approved_not_true");
    }
    return { ok: false, error: "Confirmation denied. Cart was not modified.", code: "not_approved" };
  }

  if (!input.pendingActionId || typeof input.pendingActionId !== "string") {
    return { ok: false, error: "Missing pending action.", code: "pending_not_found" };
  }

  return prisma.$transaction(async (tx) => {
    const pending = await tx.pendingConsentAction.findUnique({ where: { id: input.pendingActionId } });

    if (!pending || pending.sessionId !== input.sessionId) {
      return { ok: false, error: "No matching pending action for this session.", code: "pending_not_found" };
    }
    const actionType = pending.actionType as CartActionType;
    if (input.expectedType && input.expectedType !== "ANY" && actionType !== input.expectedType) {
      return { ok: false, error: `Pending action type ${actionType} cannot be confirmed via this endpoint.`, code: "wrong_action_type" };
    }
    if (pending.status === ConsentStatus.CONSUMED) {
      return { ok: false, error: "This confirmation was already used. Cart was not modified again.", code: "already_consumed" };
    }
    if (pending.status === ConsentStatus.CANCELLED) {
      return { ok: false, error: "This pending action was cancelled.", code: "cancelled" };
    }
    if (pending.status === ConsentStatus.EXPIRED || pending.expiresAt.getTime() <= Date.now()) {
      await tx.pendingConsentAction.updateMany({
        where: { id: pending.id, status: ConsentStatus.PENDING },
        data: { status: ConsentStatus.EXPIRED },
      });
      await audit(input.sessionId, "cart.confirm_rejected", { pendingActionId: pending.id, reason: "expired" }, tx);
      return { ok: false, error: "Pending consent expired. Propose the cart change again.", code: "expired" };
    }

    // --- Snapshot / stale validation (before claiming) ---
    let product: ProductRecord | null = null;
    if (actionType === "CART_ADD") {
      product = await getProductProvider().getById(pending.productId);
      if (!product) return { ok: false, error: "Product no longer available.", code: "product_missing" };
      const currentHash = fingerprintConsent({
        actionType: "CART_ADD",
        sessionId: input.sessionId,
        productId: product.id,
        variant: normalizeVariant(product.variant) ?? normalizeVariant(pending.variant),
        quantity: pending.quantity,
        unitPriceInr: product.priceInr,
        retailer: product.retailer,
        sourceUrl: product.sourceUrl,
      });
      // Also enforce resolved-variant identity directly:
      const variantChanged =
        normalizeVariant(product.variant) !== null &&
        normalizeVariant(pending.variant) !== null &&
        normalizeVariant(product.variant) !== normalizeVariant(pending.variant);
      if (currentHash !== pending.payloadHash || variantChanged) {
        await tx.pendingConsentAction.updateMany({
          where: { id: pending.id, status: ConsentStatus.PENDING },
          data: { status: ConsentStatus.CANCELLED, cancelledAt: new Date() },
        });
        await audit(input.sessionId, "cart.confirm_rejected", { pendingActionId: pending.id, reason: "stale_details" }, tx);
        return { ok: false, error: "Material product, price, variant, retailer or source changed since proposal. New confirmation is required.", code: "stale_details" };
      }
    } else {
      // CART_UPDATE / CART_REMOVE: cart item snapshot must be unchanged.
      if (!pending.cartItemId) return { ok: false, error: "Pending action has no cart item.", code: "stale_details" };
      const item = await tx.cartItem.findFirst({ where: { id: pending.cartItemId, sessionId: input.sessionId } });
      if (!item) {
        return { ok: false, error: "Cart item no longer exists.", code: "stale_details" };
      }
      const currentHash = fingerprintConsent({
        actionType,
        sessionId: input.sessionId,
        productId: item.productId,
        variant: item.variant,
        quantity: item.quantity,
        targetQuantity: pending.targetQuantity ?? undefined,
        unitPriceInr: item.unitPriceInr,
        retailer: item.retailer,
        sourceUrl: item.sourceUrl,
        cartItemId: item.id,
      });
      if (currentHash !== pending.payloadHash) {
        await tx.pendingConsentAction.updateMany({
          where: { id: pending.id, status: ConsentStatus.PENDING },
          data: { status: ConsentStatus.CANCELLED, cancelledAt: new Date() },
        });
        await audit(input.sessionId, "cart.confirm_rejected", { pendingActionId: pending.id, reason: "stale_cart_item" }, tx);
        return { ok: false, error: "Cart item changed since proposal. New confirmation is required.", code: "stale_details" };
      }
    }

    // --- Atomic claim: exactly one confirmer can transition PENDING -> CONSUMED ---
    const claimed = await tx.pendingConsentAction.updateMany({
      where: {
        id: pending.id,
        sessionId: input.sessionId,
        status: ConsentStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      data: { status: ConsentStatus.CONSUMED, consumedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return { ok: false, error: "This confirmation was already used or expired. Cart was not modified again.", code: "already_consumed" };
    }

    // --- Execute exactly once (inside same tx as claim) ---
    if (actionType === "CART_ADD") {
      const cartItem = await tx.cartItem.upsert({
        where: {
          sessionId_productId_variant: {
            sessionId: input.sessionId,
            productId: pending.productId,
            variant: pending.variant ?? "",
          },
        },
        create: {
          sessionId: input.sessionId,
          productId: pending.productId,
          variant: pending.variant ?? "",
          quantity: pending.quantity,
          unitPriceInr: pending.unitPriceInr,
          retailer: pending.retailer,
          sourceUrl: pending.sourceUrl,
        },
        update: {
          quantity: { increment: pending.quantity },
          unitPriceInr: pending.unitPriceInr,
          retailer: pending.retailer,
          sourceUrl: pending.sourceUrl,
        },
      });
      await audit(input.sessionId, "cart.confirm_success", {
        pendingActionId: pending.id, actionType, cartItemId: cartItem.id, productId: pending.productId, quantity: pending.quantity,
      }, tx);
      return { ok: true, cartItemId: cartItem.id, message: "Item added to ShopSmart planning cart once. Purchase must be completed manually on the retailer website." };
    }

    if (actionType === "CART_UPDATE") {
      const updated = await tx.cartItem.update({
        where: { id: pending.cartItemId! },
        data: { quantity: pending.targetQuantity! },
      });
      await audit(input.sessionId, "cart.confirm_success", {
        pendingActionId: pending.id, actionType, cartItemId: updated.id, quantity: updated.quantity,
      }, tx);
      return { ok: true, cartItemId: updated.id, message: "Cart quantity updated once in ShopSmart planning cart." };
    }

    // CART_REMOVE
    await tx.cartItem.delete({ where: { id: pending.cartItemId! } });
    await audit(input.sessionId, "cart.confirm_success", {
      pendingActionId: pending.id, actionType, cartItemId: pending.cartItemId,
    }, tx);
    return { ok: true, cartItemId: pending.cartItemId!, message: "Item removed once from ShopSmart planning cart." };
  });
}

export async function confirmCartAdd(input: ConfirmCartAddInput): Promise<ConfirmCartAddResult> {
  return confirmPendingAction({ ...input, expectedType: "CART_ADD" });
}

export async function confirmCartChange(input: ConfirmCartAddInput): Promise<ConfirmCartAddResult> {
  return confirmPendingAction({ ...input, expectedType: "ANY" });
}

export async function cancelPendingAction(input: ConfirmCartAddInput): Promise<ConfirmCartAddResult> {
  return confirmPendingAction({ ...input, approved: false });
}

// ---------------------------------------------------------------------------
// READ + legacy names (now proposal-only, never direct mutation)
// ---------------------------------------------------------------------------

export async function getCart(sessionId: string) {
  const items = await prisma.cartItem.findMany({
    where: { sessionId },
    include: { product: true },
    orderBy: { addedAt: "asc" },
  });
  const knownSubtotal = items.reduce((sum, i) => sum + i.unitPriceInr * i.quantity, 0);
  return {
    sessionId,
    items: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.product.name,
      variant: i.variant,
      quantity: i.quantity,
      unitPriceInr: i.unitPriceInr,
      lineTotalInr: i.unitPriceInr * i.quantity,
      retailer: i.retailer,
      sourceUrl: i.sourceUrl,
      imageUrl: i.product.imageUrl,
      dataProvider: i.product.dataProvider,
    })),
    knownSubtotalInr: knownSubtotal,
    unknownCosts: ["delivery", "taxes_if_not_included"],
    notice: "This is ShopSmart's planning cart only. ShopSmart never places orders or completes checkout.",
  };
}

/** @deprecated Creates a pending CART_UPDATE proposal; does NOT mutate. Confirm via confirmCartChange. */
export async function updateCartItem(input: { sessionId: string; cartItemId: string; quantity: number }) {
  return proposeCartUpdate(input);
}

/** @deprecated Creates a pending CART_REMOVE proposal; does NOT mutate. Confirm via confirmCartChange. */
export async function removeCartItem(input: { sessionId: string; cartItemId: string }) {
  return proposeCartRemove(input);
}
