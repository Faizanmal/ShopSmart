import { describe, expect, it } from "vitest";
import { buildClaimRows } from "@/lib/catalog/claims";
import type { ProductRecord } from "@/lib/catalog/types";

function sample(partial: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "ssd-test",
    name: "Test SSD",
    brand: "Test",
    model: "T1",
    variant: "1TB",
    category: "internal-ssd",
    description: "test",
    priceInr: 8000,
    currency: "INR",
    imageUrl: null,
    sourceUrl: "https://example.com/demo",
    retailer: "Demo",
    seller: null,
    availability: "Unknown",
    specs: {
      capacityGb: 1000,
      formFactor: "2.5-inch",
      interface: "SATA III",
      compatibleLaptopBay: "2.5-inch SATA",
    },
    warranty: null,
    deliveryInfo: "Unknown",
    evidence: [
      {
        claim: "2.5-inch SATA III interface",
        source: "demo-catalog#ssd-test",
        status: "verified",
      },
    ],
    missingFields: ["warranty", "deliveryEstimate", "seller"],
    conflictingFields: [],
    dataProvider: "DEMO",
    lastVerifiedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("buildClaimRows", () => {
  it("labels demo provider and marks warranty/delivery unknown when absent", () => {
    const rows = buildClaimRows(sample());
    expect(rows.find((r) => r.key === "warranty")?.status).toBe("missing");
    expect(rows.find((r) => r.key === "warranty")?.value).toBe("Unknown");
    expect(rows.find((r) => r.key === "delivery")?.status).toBe("missing");
    expect(rows.find((r) => r.key === "capacity")?.value).toContain("1000");
  });

  it("does not invent a seller when missing", () => {
    const seller = buildClaimRows(sample()).find((r) => r.key === "seller");
    expect(seller?.value).toBe("Unknown");
    expect(seller?.status).toBe("missing");
  });
});
