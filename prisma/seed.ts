import { DataProviderMode, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Curated catalog snapshot (captured 2026-10-21).
 *
 * Real products with manufacturer-verified specifications and real retailer
 * product pages (Amazon.in ASIN / Flipkart item links). Prices are a dated
 * snapshot from the linked retailer/tracker pages at capture time — they are
 * NOT live pricing and can change; the UI labels every listing
 * "Snapshot data" with this capture date, and seller/availability are
 * Unknown wherever we could not verify them. `dataProvider` stays DEMO in
 * the schema sense (not a live API feed); see docs/KNOWN_LIMITATIONS.md.
 */
const verifiedAt = new Date("2026-10-21T10:00:00.000Z");

type SeedProduct = {
  id: string;
  name: string;
  brand: string;
  model?: string;
  variant?: string;
  category: string;
  description: string;
  priceInr: number;
  imageUrl?: string;
  sourceUrl: string;
  retailer: string;
  seller?: string;
  availability?: string;
  specs: Record<string, string | number | boolean>;
  warranty?: string;
  deliveryInfo?: string;
  evidence: Array<{ claim: string; source: string; status: "verified" | "provider_claim" | "unknown" }>;
  missingFields: string[];
  conflictingFields: string[];
};

const SNAPSHOT = "Price snapshot captured 2026-10-21 from the linked retailer page — not live pricing; verify before buying";

const products: SeedProduct[] = [
  {
    id: "ssd-samsung-870-evo-1tb",
    name: "Samsung 870 EVO 1TB 2.5-inch SATA SSD (MZ-77E1T0BW)",
    brand: "Samsung",
    model: "870 EVO MZ-77E1T0BW",
    variant: "1TB",
    category: "internal-ssd",
    description:
      "2.5-inch SATA III internal SSD. Suitable for laptops that support 2.5-inch SATA drives.",
    priceInr: 37499,
    imageUrl:
      "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=640&q=80",
    sourceUrl: "https://www.amazon.in/Samsung-Internal-Solid-State-MZ-77E1T0/dp/B08T1SMTF9",
    retailer: "Amazon.in",
    availability: "Unknown",
    specs: {
      capacityGb: 1000,
      formFactor: "2.5-inch",
      interface: "SATA III",
      sequentialReadMBps: 560,
      sequentialWriteMBps: 530,
      nandType: "TLC",
      compatibleLaptopBay: "2.5-inch SATA",
    },
    warranty: "5-year limited warranty (manufacturer, per Amazon.in listing B08T1SMTF9)",
    deliveryInfo: "Unknown — check the retailer page for your pincode",
    evidence: [
      { claim: "1TB capacity, 2.5-inch SATA III (MZ-77E1T0BW)", source: "Amazon.in B08T1SMTF9 product details", status: "verified" },
      { claim: "Sequential read 560 MB/s, write 530 MB/s", source: "Samsung 870 EVO manufacturer specifications", status: "verified" },
      { claim: `₹37,499 — ${SNAPSHOT} (price-history tracker for Amazon.in, 18 Oct 2026; marketplace prices for this drive vary widely)`, source: "pricehistory.app/p/samsung-870-evo-1tb-sata-6-35-d3JCA3Q2", status: "provider_claim" },
    ],
    missingFields: ["deliveryEstimate", "sellerRating", "seller"],
    conflictingFields: ["price"],
  },
  {
    id: "ssd-crucial-mx500-1tb",
    name: "Crucial MX500 1TB 2.5-inch SATA SSD (CT1000MX500SSD1)",
    brand: "Crucial",
    model: "MX500 CT1000MX500SSD1",
    variant: "1TB",
    category: "internal-ssd",
    description: "2.5-inch/7mm SATA SSD commonly used for laptop upgrades.",
    priceInr: 8338,
    imageUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=640&q=80",
    sourceUrl: "https://www.amazon.in/Crucial-MX500-1TB-2-5-inch-SSD/dp/B078211KBB",
    retailer: "Amazon.in",
    availability: "No featured offer on Amazon.in at snapshot date — check buying options",
    specs: {
      capacityGb: 1000,
      formFactor: "2.5-inch",
      interface: "SATA III",
      sequentialReadMBps: 560,
      sequentialWriteMBps: 510,
      nandType: "TLC",
      compatibleLaptopBay: "2.5-inch SATA",
    },
    warranty: "5-year warranty (Crucial, per Amazon.in listing B078211KBB)",
    deliveryInfo: "Unknown — check the retailer page for your pincode",
    evidence: [
      { claim: "SATA III 2.5-inch/7mm form factor, 1TB (CT1000MX500SSD1)", source: "Amazon.in B078211KBB product details", status: "verified" },
      { claim: "Price snapshot ₹8,338 is the last tracked Amazon.in price (Apr 2025) and may be stale; the drive had no featured offer on 2026-10-21", source: "price-history.in/product/crucial-mx500-1tb-sata-6-35-UVdQHjmb", status: "provider_claim" },
    ],
    missingFields: ["deliveryEstimate", "taxBreakdown", "currentAvailability"],
    conflictingFields: [],
  },
  {
    id: "ssd-wd-blue-1tb-sata",
    name: "WD Blue SA510 1TB 2.5-inch SATA SSD (WDS100T3B0A)",
    brand: "Western Digital",
    model: "Blue SA510 WDS100T3B0A",
    variant: "1TB",
    category: "internal-ssd",
    description: "WD Blue SA510 2.5-inch/7mm SATA III SSD for laptop and desktop upgrades.",
    priceInr: 17499,
    imageUrl:
      "https://images.unsplash.com/photo-1555617981-dac3880eac6e?w=640&q=80",
    sourceUrl: "https://www.flipkart.com/western-digital-wd-blue-sata-1-tb-desktop-laptop-internal-solid-state-drive-ssd-wds100t3b0a/p/itm4cfd929a810e7",
    retailer: "Flipkart",
    seller: "RetailNet (per Flipkart listing at snapshot date)",
    availability: "Unknown",
    specs: {
      capacityGb: 1000,
      formFactor: "2.5-inch",
      interface: "SATA III",
      sequentialReadMBps: 560,
      sequentialWriteMBps: 520,
      nandType: "TLC",
      compatibleLaptopBay: "2.5-inch SATA",
    },
    warranty: "5-year limited warranty (WD, per Flipkart listing)",
    deliveryInfo: "Unknown — check the retailer page for your pincode",
    evidence: [
      { claim: "1TB, 2.5-inch/7mm, SATA III, up to 560/520 MB/s (WDS100T3B0A)", source: "Western Digital SA510 specifications; Flipkart item itm4cfd929a810e7", status: "verified" },
      { claim: `₹17,499 — ${SNAPSHOT} (Flipkart listing, seller RetailNet)`, source: "flipkart.com item itm4cfd929a810e7", status: "provider_claim" },
    ],
    missingFields: ["sellerRating", "deliveryEstimate"],
    conflictingFields: [],
  },
  {
    id: "ssd-crucial-bx500-1tb",
    name: "Crucial BX500 1TB 2.5-inch SATA SSD (CT1000BX500SSD1)",
    brand: "Crucial",
    model: "BX500 CT1000BX500SSD1",
    variant: "1TB",
    category: "internal-ssd",
    description: "Budget 2.5-inch SATA III SSD with 3D NAND for everyday laptop upgrades.",
    priceInr: 18500,
    imageUrl:
      "https://images.unsplash.com/photo-1591488320449-011480220e81?w=640&q=80",
    sourceUrl: "https://www.amazon.in/Crucial-BX500-NAND-2-5-Inch-Internal/dp/B07YD579WM",
    retailer: "Amazon.in",
    availability: "Unknown",
    specs: {
      capacityGb: 1000,
      formFactor: "2.5-inch",
      interface: "SATA III",
      sequentialReadMBps: 540,
      sequentialWriteMBps: 500,
      nandType: "TLC",
      compatibleLaptopBay: "2.5-inch SATA",
    },
    warranty: "3-year warranty (Crucial)",
    deliveryInfo: "Unknown — check the retailer page for your pincode",
    evidence: [
      { claim: "1TB, 2.5-inch, SATA III (CT1000BX500SSD1)", source: "Amazon.in B07YD579WM product details", status: "verified" },
      { claim: `₹18,500 — ${SNAPSHOT} (price-history tracker for Amazon.in, 19 Oct 2026)`, source: "pricehistory.app/p/crucial-1tb-bx500-2-5-inch-internal-Z7BjRlQ2", status: "provider_claim" },
    ],
    missingFields: ["deliveryEstimate", "sellerRating", "seller"],
    conflictingFields: [],
  },
  {
    id: "ssd-kingston-nv2-1tb-nvme",
    name: "Kingston NV2 1TB NVMe M.2 SSD (SNV2S/1000G)",
    brand: "Kingston",
    model: "NV2 SNV2S/1000G",
    variant: "1TB",
    category: "internal-ssd",
    description:
      "M.2 2280 PCIe NVMe SSD. NOT compatible with laptops that only support 2.5-inch SATA drives.",
    priceInr: 26743,
    imageUrl:
      "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=640&q=80",
    sourceUrl: "https://www.amazon.in/Kingston-2280-Internal-SNV2S-1000G/dp/B0BBWH1R8H",
    retailer: "Amazon.in",
    availability: "Unknown",
    specs: {
      capacityGb: 1000,
      formFactor: "M.2 2280",
      interface: "NVMe PCIe Gen4",
      sequentialReadMBps: 3500,
      sequentialWriteMBps: 2100,
      nandType: "TLC",
      compatibleLaptopBay: "M.2 NVMe",
    },
    warranty: "3-year warranty (Kingston)",
    deliveryInfo: "Unknown — check the retailer page for your pincode",
    evidence: [
      { claim: "Form factor is M.2 2280 NVMe, not 2.5-inch SATA", source: "Amazon.in B0BBWH1R8H product details; Kingston NV2 specifications", status: "verified" },
      { claim: `₹26,743 — ${SNAPSHOT} (Amazon.in listing page)`, source: "Amazon.in B0BBWH1R8H", status: "provider_claim" },
    ],
    missingFields: ["deliveryEstimate", "seller"],
    conflictingFields: [],
  },
  {
    id: "ssd-sandisk-ssd-plus-500gb",
    name: "SanDisk SSD Plus 500GB 2.5-inch SATA",
    brand: "SanDisk",
    model: "SSD Plus",
    variant: "500GB",
    category: "internal-ssd",
    description: "2.5-inch SATA drive but only 500GB — fails a 1TB hard capacity requirement.",
    priceInr: 3999,
    imageUrl:
      "https://images.unsplash.com/photo-1562408590-e32931084e23?w=640&q=80",
    sourceUrl: "https://www.amazon.in/s?k=SanDisk+SSD+Plus+500GB+2.5-inch+SATA",
    retailer: "Amazon.in (search link — exact listing not verified)",
    availability: "Unknown",
    specs: {
      capacityGb: 500,
      formFactor: "2.5-inch",
      interface: "SATA III",
      sequentialReadMBps: 535,
      sequentialWriteMBps: 445,
      nandType: "TLC",
      compatibleLaptopBay: "2.5-inch SATA",
    },
    warranty: "3-year warranty (SanDisk, model-dependent)",
    deliveryInfo: "Unknown",
    evidence: [
      { claim: "Capacity is 500GB", source: "SanDisk SSD Plus product line specifications", status: "verified" },
      { claim: "Indicative price only — linked page is a retailer search, not a verified listing; capture a listing price before relying on it", source: "ShopSmart catalog curation note, 2026-10-21", status: "unknown" },
    ],
    missingFields: ["deliveryEstimate", "verifiedListing", "seller"],
    conflictingFields: [],
  },
  {
    id: "ssd-generic-1tb-unverified",
    name: "Unbranded 1TB Internal SSD (marketplace listing, details incomplete)",
    brand: "GenericPro",
    model: "Ultra (unbranded)",
    variant: "1TB",
    category: "internal-ssd",
    description:
      "Incomplete unbranded marketplace listing used to demonstrate unverifiable compatibility and missing evidence. Kept deliberately: a real shopping assistant must say 'unknown' here instead of guessing.",
    priceInr: 6999,
    imageUrl:
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=640&q=80",
    sourceUrl: "https://www.amazon.in/s?k=unbranded+1TB+internal+SSD",
    retailer: "Amazon.in (search link — no verified listing)",
    availability: "Unknown",
    specs: {
      capacityGb: 1000,
      formFactor: "unknown",
      interface: "unknown",
    },
    deliveryInfo: "Unknown",
    evidence: [
      { claim: "Listed as 1TB internal SSD", source: "unbranded marketplace listing text", status: "provider_claim" },
      { claim: "Interface and form factor", source: "not provided by listing", status: "unknown" },
      { claim: "One marketplace page says SATA; another says NVMe — unresolved", source: "catalog curation conflict note", status: "unknown" },
    ],
    missingFields: ["formFactor", "interface", "warranty", "seller", "deliveryEstimate", "compatibility"],
    conflictingFields: ["interface"],
  },
  {
    id: "ssd-samsung-990-pro-1tb",
    name: "Samsung 990 PRO 1TB NVMe M.2 SSD (MZ-V9P1T0BW)",
    brand: "Samsung",
    model: "990 PRO MZ-V9P1T0BW",
    variant: "1TB",
    category: "internal-ssd",
    description: "High-performance PCIe Gen4 NVMe drive; incompatible with 2.5-inch SATA-only laptops.",
    priceInr: 29299,
    imageUrl:
      "https://images.unsplash.com/photo-1591488320449-011480220e81?w=640&q=80",
    sourceUrl: "https://www.amazon.in/Samsung-Internal-Expansion-Graphics-MZ-V9P1T0B/dp/B0B9C3ZVHR",
    retailer: "Amazon.in",
    availability: "Unknown",
    specs: {
      capacityGb: 1000,
      formFactor: "M.2 2280",
      interface: "NVMe PCIe Gen4",
      sequentialReadMBps: 7450,
      sequentialWriteMBps: 6900,
      nandType: "TLC",
      compatibleLaptopBay: "M.2 NVMe",
    },
    warranty: "5-year limited warranty (Samsung, per Amazon.in listing B0B9C3ZVHR)",
    deliveryInfo: "Unknown — check the retailer page for your pincode",
    evidence: [
      { claim: "NVMe M.2 PCIe Gen4, up to 7,450/6,900 MB/s (MZ-V9P1T0BW)", source: "Amazon.in B0B9C3ZVHR product details; Samsung 990 PRO specifications", status: "verified" },
      { claim: `₹29,299 — ${SNAPSHOT} (Amazon.in listing page; specialist retailers tracked lower the same week)`, source: "Amazon.in B0B9C3ZVHR", status: "provider_claim" },
    ],
    missingFields: ["deliveryEstimate", "seller"],
    conflictingFields: [],
  },
  {
    id: "hdd-seagate-1tb-25",
    name: "Seagate BarraCuda 1TB 2.5-inch HDD (ST1000LM048)",
    brand: "Seagate",
    model: "BarraCuda ST1000LM048",
    variant: "1TB",
    category: "internal-hdd",
    description: "Mechanical 5400 RPM hard drive — wrong category for an SSD requirement.",
    priceInr: 6899,
    imageUrl:
      "https://images.unsplash.com/photo-1531492746076-161ca9bcad58?w=640&q=80",
    sourceUrl: "https://www.amazon.in/Seagate-Laptop-2-5-Inch-Internal-ST1000LM048/dp/B01LY3Q201",
    retailer: "Amazon.in",
    availability: "Currently unavailable on Amazon.in at snapshot date",
    specs: {
      capacityGb: 1000,
      formFactor: "2.5-inch",
      interface: "SATA III",
      mediaType: "HDD",
      compatibleLaptopBay: "2.5-inch SATA",
    },
    warranty: "2-year limited warranty (Seagate, per Amazon.in listing B01LY3Q201)",
    deliveryInfo: "Unknown",
    evidence: [
      { claim: "Product is a 5400 RPM mechanical HDD, not an SSD (ST1000LM048)", source: "Amazon.in B01LY3Q201 product details", status: "verified" },
      { claim: "Last tracked Amazon.in price ₹6,899 (Sep 2025); listing was unavailable on 2026-10-21 — do not treat as buyable at this price", source: "pricehistory.app/p/seagate-barracuda-1tb-internal-hard-drive-hdd-dbShhoSj", status: "provider_claim" },
    ],
    missingFields: ["deliveryEstimate", "currentAvailability"],
    conflictingFields: [],
  },
];

async function main() {
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name, brand: p.brand, model: p.model, variant: p.variant,
        category: p.category, description: p.description, priceInr: p.priceInr,
        imageUrl: p.imageUrl, sourceUrl: p.sourceUrl, retailer: p.retailer,
        seller: p.seller, availability: p.availability, specs: p.specs,
        warranty: p.warranty, deliveryInfo: p.deliveryInfo, evidence: p.evidence,
        missingFields: p.missingFields, conflictingFields: p.conflictingFields,
        dataProvider: DataProviderMode.DEMO, lastVerifiedAt: verifiedAt,
      },
      create: {
        id: p.id, name: p.name, brand: p.brand, model: p.model, variant: p.variant,
        category: p.category, description: p.description, priceInr: p.priceInr,
        imageUrl: p.imageUrl, sourceUrl: p.sourceUrl, retailer: p.retailer,
        seller: p.seller, availability: p.availability, specs: p.specs,
        warranty: p.warranty, deliveryInfo: p.deliveryInfo, evidence: p.evidence,
        missingFields: p.missingFields, conflictingFields: p.conflictingFields,
        dataProvider: DataProviderMode.DEMO, lastVerifiedAt: verifiedAt,
      },
    });
  }
  console.log(`Seeded ${products.length} curated catalog snapshot products (real products/links, prices captured 2026-10-21, dataProvider=DEMO).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
