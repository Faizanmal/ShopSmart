import { z } from "zod";
import { getProductProvider } from "@/lib/catalog";
import { buildClaimRows } from "@/lib/catalog/claims";
import { compareProducts } from "@/lib/compare/compareProducts";
import { verifyProductRequirements } from "@/lib/verify/verifyRequirements";
import {
  confirmCartAdd,
  confirmCartChange,
  getCart,
  proposeCartAdd,
  proposeCartRemove,
  proposeCartUpdate,
  removeCartItem,
  updateCartItem,
} from "@/lib/cart/consent";
import { manageShortlist, getSessionBundle } from "@/lib/session/service";
import type { ParsedCriterion } from "@/lib/criteria/types";
import { prisma } from "@/lib/db";

export const toolSchemas = {
  search_products: z.object({
    sessionId: z.string(),
    query: z.string().optional(),
    category: z.string().optional(),
    budgetMinInr: z.number().int().optional(),
    budgetMaxInr: z.number().int().optional(),
    brand: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  get_product_details: z.object({
    sessionId: z.string(),
    productId: z.string(),
  }),
  verify_product_requirements: z.object({
    sessionId: z.string(),
    productId: z.string(),
  }),
  compare_products: z.object({
    sessionId: z.string(),
    productIds: z.array(z.string()).min(2).max(6),
  }),
  manage_shortlist: z.object({
    sessionId: z.string(),
    action: z.enum(["add", "remove", "list"]),
    productId: z.string().optional(),
    note: z.string().optional(),
  }),
  propose_cart_add: z.object({
    sessionId: z.string(),
    productId: z.string(),
    quantity: z.number().int().min(1).max(20).default(1),
    variant: z.string().optional(),
  }),
  confirm_cart_add: z.object({
    sessionId: z.string(),
    pendingActionId: z.string(),
    approved: z.boolean(),
  }),
  get_cart: z.object({
    sessionId: z.string(),
  }),
  propose_cart_update: z.object({
    sessionId: z.string(),
    cartItemId: z.string(),
    quantity: z.number().int().min(1).max(20),
  }),
  propose_cart_remove: z.object({
    sessionId: z.string(),
    cartItemId: z.string(),
  }),
  confirm_cart_change: z.object({
    sessionId: z.string(),
    pendingActionId: z.string(),
    approved: z.boolean(),
  }),
  // Legacy names: proposal-only (never mutate directly).
  update_cart_item: z.object({
    sessionId: z.string(),
    cartItemId: z.string(),
    quantity: z.number().int().min(1).max(20),
  }),
  remove_cart_item: z.object({
    sessionId: z.string(),
    cartItemId: z.string(),
  }),
};

async function criteriaForSession(sessionId: string): Promise<ParsedCriterion[]> {
  const brief = await prisma.shoppingBrief.findUnique({
    where: { sessionId },
    include: { criteria: true },
  });
  if (!brief) return [];
  return brief.criteria.map((c) => ({
    kind: c.kind,
    key: c.key,
    label: c.label,
    value: c.value,
    sourceText: c.sourceText ?? undefined,
  }));
}

async function assertSession(sessionId: string) {
  const s = await prisma.shoppingSession.findUnique({ where: { id: sessionId } });
  if (!s) throw new Error(`Unknown sessionId: ${sessionId}`);
}

export async function executeTool(name: string, args: unknown): Promise<unknown> {
  switch (name) {
    case "search_products": {
      const input = toolSchemas.search_products.parse(args);
      await assertSession(input.sessionId);
      const provider = getProductProvider();
      const products = await provider.search(input);
      return {
        dataProvider: provider.mode,
        count: products.length,
        products: products.map((p) => ({ ...p, claimRows: buildClaimRows(p) })),
        notice:
          provider.mode === "DEMO"
            ? "Results are from a curated catalog snapshot: real products and retailer links, prices captured 2026-10-21 — not live pricing. Verify price and availability on the retailer page before buying."
            : "Live results from Amazon.in via SerpApi, fetched just now. Fields the API does not supply (seller, delivery, tax) remain Unknown.",
      };
    }
    case "get_product_details": {
      const input = toolSchemas.get_product_details.parse(args);
      await assertSession(input.sessionId);
      const product = await getProductProvider().getById(input.productId);
      if (!product) {
        throw new Error(`Product not found: ${input.productId}`);
      }
      return { product: { ...product, claimRows: buildClaimRows(product) } };
    }
    case "verify_product_requirements": {
      const input = toolSchemas.verify_product_requirements.parse(args);
      await assertSession(input.sessionId);
      const product = await getProductProvider().getById(input.productId);
      if (!product) return { error: "Product not found" };
      const criteria = await criteriaForSession(input.sessionId);
      return verifyProductRequirements(product, criteria);
    }
    case "compare_products": {
      const input = toolSchemas.compare_products.parse(args);
      await assertSession(input.sessionId);
      const provider = getProductProvider();
      const products = (
        await Promise.all(input.productIds.map((id) => provider.getById(id)))
      ).filter((p): p is NonNullable<typeof p> => p != null);
      const criteria = await criteriaForSession(input.sessionId);
      return {
        dataProvider: provider.mode,
        comparison: compareProducts(products, criteria),
      };
    }
    case "manage_shortlist": {
      const input = toolSchemas.manage_shortlist.parse(args);
      await assertSession(input.sessionId);
      return manageShortlist(input);
    }
    case "propose_cart_add": {
      const input = toolSchemas.propose_cart_add.parse(args);
      return proposeCartAdd(input);
    }
    case "confirm_cart_add": {
      const input = toolSchemas.confirm_cart_add.parse(args);
      return confirmCartAdd(input);
    }
    case "get_cart": {
      const input = toolSchemas.get_cart.parse(args);
      await assertSession(input.sessionId);
      return getCart(input.sessionId);
    }
    case "propose_cart_update": {
      const input = toolSchemas.propose_cart_update.parse(args);
      return proposeCartUpdate(input);
    }
    case "propose_cart_remove": {
      const input = toolSchemas.propose_cart_remove.parse(args);
      return proposeCartRemove(input);
    }
    case "confirm_cart_change": {
      const input = toolSchemas.confirm_cart_change.parse(args);
      return confirmCartChange(input);
    }
    case "update_cart_item": {
      const input = toolSchemas.update_cart_item.parse(args);
      return updateCartItem(input);
    }
    case "remove_cart_item": {
      const input = toolSchemas.remove_cart_item.parse(args);
      return removeCartItem(input);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function debugSession(sessionId: string) {
  return getSessionBundle(sessionId);
}
