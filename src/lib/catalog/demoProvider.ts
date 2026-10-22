import { prisma } from "@/lib/db";
import type { ProductProvider, ProductRecord, SearchProductsInput } from "./types";
import type { Product } from "@prisma/client";

export function productRowToRecord(p: Product): ProductRecord {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    model: p.model,
    variant: p.variant,
    category: p.category,
    description: p.description,
    priceInr: p.priceInr,
    currency: p.currency,
    imageUrl: p.imageUrl,
    sourceUrl: p.sourceUrl,
    retailer: p.retailer,
    seller: p.seller,
    availability: p.availability,
    specs: (p.specs ?? {}) as Record<string, string | number | boolean | null>,
    warranty: p.warranty,
    deliveryInfo: p.deliveryInfo,
    evidence: (p.evidence ?? []) as ProductRecord["evidence"],
    missingFields: p.missingFields,
    conflictingFields: p.conflictingFields,
    dataProvider: p.dataProvider,
    lastVerifiedAt: p.lastVerifiedAt.toISOString(),
  };
}

export class DemoCatalogProvider implements ProductProvider {
  readonly mode = "DEMO" as const;

  async search(input: SearchProductsInput): Promise<ProductRecord[]> {
    const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);
    const rows = await prisma.product.findMany({
      where: {
        AND: [
          // Snapshot scope: rows persisted by the live provider (dataProvider
          // LIVE) must never leak into demo search results.
          { dataProvider: "DEMO" },
          input.category ? { category: input.category } : {},
          input.brand ? { brand: { contains: input.brand, mode: "insensitive" } } : {},
          input.budgetMinInr != null ? { priceInr: { gte: input.budgetMinInr } } : {},
          input.budgetMaxInr != null ? { priceInr: { lte: input.budgetMaxInr } } : {},
        ],
      },
    });

    // Tokenized relevance, like a real catalog search: a product scores one
    // point per query term found across its name/brand/model/description/
    // category. Search is recall only — hard constraints are enforced later
    // by verify_product_requirements, never by hiding candidates here.
    const terms = (input.query ?? "")
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const scored = rows.map((row) => {
      const product = productRowToRecord(row);
      if (terms.length === 0) return { product, score: 0 };
      const haystack = [
        product.name,
        product.brand,
        product.model ?? "",
        product.description,
        product.category,
      ]
        .join(" ")
        .toLowerCase();
      const score = terms.filter((t) => haystack.includes(t)).length;
      return { product, score };
    });

    return scored
      .filter((s) => terms.length === 0 || s.score > 0)
      .sort((a, b) => b.score - a.score || a.product.priceInr - b.product.priceInr)
      .slice(0, limit)
      .map((s) => s.product);
  }

  async getById(id: string): Promise<ProductRecord | null> {
    const p = await prisma.product.findUnique({ where: { id } });
    return p ? productRowToRecord(p) : null;
  }
}
