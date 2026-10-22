import { DataProviderMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { productRowToRecord } from "./demoProvider";
import type { ProductProvider, ProductRecord, SearchProductsInput } from "./types";

/**
 * Live product provider — SerpApi Amazon search (amazon.in).
 *
 * Enabled with PRODUCT_PROVIDER=live + SERPAPI_API_KEY (server-side only).
 * Returns REAL current Amazon.in listings: ASIN, title, price, product link
 * and image as returned by the API at fetch time. Fields the API does not
 * supply (seller, delivery estimate, tax breakdown, some specs) stay
 * Unknown — they are never invented. Specs are parsed only from the listing
 * title / specification text the API returns, and evidence rows say so.
 *
 * Fetched products are persisted (dataProvider=LIVE, lastVerifiedAt=fetch
 * time) so get_product_details, verification, comparison and the consent
 * flow can re-read the exact record the user saw.
 */

const SERPAPI_BASE = "https://serpapi.com/search.json";
const KNOWN_BRANDS = [
  "Samsung", "Crucial", "Kingston", "Seagate", "SanDisk", "Western Digital", "WD",
  "ADATA", "HP", "Dell", "Lenovo", "Transcend", "Gigabyte", "Corsair", "Sabrent",
  "Lexar", "Micron", "SK Hynix", "Hikvision", "Dahua", "Consistent", "Zebronics",
  "EVM", "Simmtronics", "Ant Esports",
];

function apiKey(): string {
  return (process.env.SERPAPI_API_KEY ?? "").trim();
}

export function specsFromText(text: string): Record<string, string | number | boolean | null> {
  const specs: Record<string, string | number | boolean | null> = {};
  const cap = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB)\b/i);
  if (cap) {
    const n = Number(cap[1]);
    specs.capacityGb = cap[2].toUpperCase() === "TB" ? Math.round(n * 1000) : Math.round(n);
  }
  if (/2\.5[\s-]*(inch|")|6\.35\s*cm/i.test(text)) specs.formFactor = "2.5-inch";
  else if (/M\.2\s*2280/i.test(text)) specs.formFactor = "M.2 2280";
  else if (/M\.2/i.test(text)) specs.formFactor = "M.2";
  if (/NVMe/i.test(text)) specs.interface = /Gen\s*4|PCIe\s*4/i.test(text) ? "NVMe PCIe Gen4" : "NVMe PCIe Gen3";
  else if (/SATA/i.test(text)) specs.interface = "SATA III";
  if (specs.formFactor === "2.5-inch" && String(specs.interface ?? "").includes("SATA")) {
    specs.compatibleLaptopBay = "2.5-inch SATA";
  } else if (String(specs.formFactor ?? "").startsWith("M.2") && String(specs.interface ?? "").includes("NVMe")) {
    specs.compatibleLaptopBay = "M.2 NVMe";
  }
  if (/\bHDD\b|Hard Disk Drive|Mechanical/i.test(text) && !/Solid State/i.test(text)) {
    specs.mediaType = "HDD";
  }
  const speeds = [...text.matchAll(/(\d{3,5})\s*MB\/s/gi)].map((m) => Number(m[1]));
  if (speeds.length >= 1) specs.sequentialReadMBps = speeds[0];
  if (speeds.length >= 2) specs.sequentialWriteMBps = speeds[1];
  return specs;
}

function parsePrice(result: Record<string, unknown>): number | null {
  const extracted = result.extracted_price;
  if (typeof extracted === "number" && extracted > 0) return Math.round(extracted);
  const priceObj = result.price as { extracted?: number; raw?: string } | string | undefined;
  if (priceObj && typeof priceObj === "object" && typeof priceObj.extracted === "number") {
    return Math.round(priceObj.extracted);
  }
  const raw = typeof priceObj === "string" ? priceObj : (priceObj?.raw ?? "");
  const n = Number(String(raw).replace(/[₹$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function brandFromTitle(title: string): string {
  for (const b of KNOWN_BRANDS) {
    if (title.toLowerCase().startsWith(b.toLowerCase())) return b === "WD" ? "Western Digital" : b;
  }
  return title.split(/\s+/)[0] ?? "Unknown";
}

function categoryFromTitle(title: string): string {
  if (/\bHDD\b|Hard Disk Drive/i.test(title) && !/SSD|Solid State/i.test(title)) return "internal-hdd";
  return "internal-ssd";
}

export type SerpApiResult = Record<string, unknown>;

/** Pure mapping from one SerpApi Amazon organic result to a ProductRecord (unit-tested). */
export function mapSerpApiResult(result: SerpApiResult, now: Date): ProductRecord | null {
  const asin = typeof result.asin === "string" ? result.asin : "";
  const title = typeof result.title === "string" ? result.title : "";
  const priceInr = parsePrice(result);
  if (!asin || !title || priceInr == null) return null;

  const link =
    (typeof result.link_clean === "string" && result.link_clean) ||
    (typeof result.link === "string" && result.link) ||
    `https://www.amazon.in/dp/${asin}`;
  const imageUrl =
    (typeof result.thumbnail === "string" && result.thumbnail) ||
    (Array.isArray(result.images) && typeof result.images[0] === "string" ? result.images[0] : null);

  const specs = specsFromText(title);
  const missingFields: string[] = [];
  if (!specs.formFactor) missingFields.push("formFactor");
  if (!specs.interface) missingFields.push("interface");
  if (!specs.capacityGb) missingFields.push("capacity");
  missingFields.push("seller", "deliveryEstimate", "taxBreakdown");

  const fetchedAt = now.toISOString();
  return {
    id: `live-${asin.toLowerCase()}`,
    name: title,
    brand: brandFromTitle(title),
    model: null,
    variant: specs.capacityGb ? `${specs.capacityGb}GB` : null,
    category: categoryFromTitle(title),
    description: title,
    priceInr,
    currency: "INR",
    imageUrl,
    sourceUrl: link,
    retailer: "Amazon.in",
    seller: null,
    availability: null,
    specs,
    warranty: null,
    deliveryInfo: null,
    evidence: [
      {
        claim: `Live Amazon.in listing price ₹${priceInr} at fetch time`,
        source: `SerpApi Amazon search (amazon.in), ASIN ${asin}, fetched ${fetchedAt}`,
        status: "provider_claim",
      },
      {
        claim: "Specifications parsed from the listing title as returned by the API",
        source: `SerpApi Amazon search result, ASIN ${asin}`,
        status: "provider_claim",
      },
      {
        claim: "Seller, delivery estimate and tax breakdown",
        source: "not supplied by the search API result",
        status: "unknown",
      },
    ],
    missingFields,
    conflictingFields: [],
    dataProvider: "LIVE",
    lastVerifiedAt: fetchedAt,
  };
}

async function serpApiFetch(params: Record<string, string>): Promise<Record<string, unknown>> {
  const key = apiKey();
  if (!key) {
    throw new Error("SERPAPI_API_KEY is not configured. Add it to the server-side .env to use the live provider.");
  }
  const url = new URL(SERPAPI_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", key);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = typeof data.error === "string" ? data.error : res.statusText;
    throw new Error(`SerpApi request failed (${res.status}): ${detail}`);
  }
  if (typeof data.error === "string") {
    throw new Error(`SerpApi error: ${data.error}`);
  }
  return data;
}

async function persistLive(product: ProductRecord): Promise<void> {
  await prisma.product.upsert({
    where: { id: product.id },
    update: {
      name: product.name, brand: product.brand, model: product.model, variant: product.variant,
      category: product.category, description: product.description, priceInr: product.priceInr,
      currency: product.currency, imageUrl: product.imageUrl, sourceUrl: product.sourceUrl,
      retailer: product.retailer, seller: product.seller, availability: product.availability,
      specs: product.specs, warranty: product.warranty, deliveryInfo: product.deliveryInfo,
      evidence: product.evidence, missingFields: product.missingFields,
      conflictingFields: product.conflictingFields, dataProvider: DataProviderMode.LIVE,
      lastVerifiedAt: new Date(product.lastVerifiedAt),
    },
    create: {
      id: product.id, name: product.name, brand: product.brand, model: product.model,
      variant: product.variant, category: product.category, description: product.description,
      priceInr: product.priceInr, currency: product.currency, imageUrl: product.imageUrl,
      sourceUrl: product.sourceUrl, retailer: product.retailer, seller: product.seller,
      availability: product.availability, specs: product.specs, warranty: product.warranty,
      deliveryInfo: product.deliveryInfo, evidence: product.evidence,
      missingFields: product.missingFields, conflictingFields: product.conflictingFields,
      dataProvider: DataProviderMode.LIVE, lastVerifiedAt: new Date(product.lastVerifiedAt),
    },
  });
}

export class LiveCatalogProvider implements ProductProvider {
  readonly mode = "LIVE" as const;

  async search(input: SearchProductsInput): Promise<ProductRecord[]> {
    const termParts = [
      input.query?.trim(),
      input.brand?.trim(),
      input.category === "internal-ssd" ? "internal SSD" : input.category === "internal-hdd" ? "internal HDD" : undefined,
    ].filter(Boolean);
    const searchTerm = termParts.join(" ") || "internal SSD 1TB";
    const data = await serpApiFetch({
      engine: "amazon",
      amazon_domain: "amazon.in",
      // SerpApi Amazon engine: the search query parameter is `k`
      // (optionally with `s` for sort). There is no result-count param.
      k: searchTerm,
      s: "relevanceblender",
    });
    const organic = Array.isArray(data.organic_results) ? (data.organic_results as SerpApiResult[]) : [];
    const now = new Date();
    const seenAsins = new Set<string>();
    let products = organic
      .map((r) => mapSerpApiResult(r, now))
      .filter((p): p is ProductRecord => p != null)
      .filter((p) => {
        if (seenAsins.has(p.id)) return false;
        seenAsins.add(p.id);
        return true;
      });

    // The API ranks; we only apply the caller's explicit filters, and say so.
    if (input.budgetMinInr != null) products = products.filter((p) => p.priceInr >= input.budgetMinInr!);
    if (input.budgetMaxInr != null) products = products.filter((p) => p.priceInr <= input.budgetMaxInr!);
    products = products.slice(0, Math.min(Math.max(input.limit ?? 12, 1), 20));

    for (const p of products) await persistLive(p);
    return products;
  }

  async getById(id: string): Promise<ProductRecord | null> {
    const row = await prisma.product.findUnique({ where: { id } });
    if (row) return productRowToRecord(row);
    if (!id.startsWith("live-")) return null;

    const asin = id.slice("live-".length).toUpperCase();
    const data = await serpApiFetch({
      engine: "amazon_product",
      amazon_domain: "amazon.in",
      asin,
    });
    const pr = (data.product_results ?? data) as Record<string, unknown>;
    const title = typeof pr.title === "string" ? pr.title : "";
    if (!title) return null;
    const base = mapSerpApiResult({ ...pr, asin, title }, new Date());
    if (!base) return null;

    // Enrich specs/warranty from the product page when the API provides them.
    const specText = JSON.stringify(pr.specifications ?? pr.product_specifications ?? "");
    const enrichedSpecs = { ...base.specs, ...specsFromText(`${title} ${specText}`) };
    const warrantyMatch = `${title} ${specText}`.match(/(\d+)[\s-]*(year|yr)/i);
    const enriched: ProductRecord = {
      ...base,
      specs: enrichedSpecs,
      warranty: warrantyMatch ? `${warrantyMatch[1]}-year warranty (per Amazon.in product page)` : base.warranty,
      missingFields: base.missingFields.filter(
        (f) => !(f === "formFactor" && enrichedSpecs.formFactor) && !(f === "interface" && enrichedSpecs.interface),
      ),
    };
    await persistLive(enriched);
    return enriched;
  }
}

export function isLiveProviderConfigured(): boolean {
  return apiKey().length > 0;
}
