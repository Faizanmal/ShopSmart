import { describe, expect, it } from "vitest";
import { parseShoppingBrief } from "@/lib/criteria/parseBrief";
import { verifyProductRequirements } from "@/lib/verify/verifyRequirements";
import type { ProductRecord } from "@/lib/catalog/types";

function product(partial: Partial<ProductRecord> & Pick<ProductRecord, "id" | "name">): ProductRecord {
  return {
    brand: "Test",
    model: null,
    variant: "1TB",
    category: "internal-ssd",
    description: "",
    priceInr: 8000,
    currency: "INR",
    imageUrl: null,
    sourceUrl: "https://example.com",
    retailer: "Demo",
    seller: null,
    availability: "In stock (demo)",
    specs: {
      capacityGb: 1000,
      formFactor: "2.5-inch",
      interface: "SATA III",
      compatibleLaptopBay: "2.5-inch SATA",
    },
    warranty: "5 years",
    deliveryInfo: null,
    evidence: [],
    missingFields: [],
    conflictingFields: [],
    dataProvider: "DEMO",
    lastVerifiedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("verifyProductRequirements", () => {
  const criteria = parseShoppingBrief(
    "1 TB SSD 2.5-inch SATA laptop budget ₹7000-₹10000",
  ).criteria;

  it("passes a compatible SATA SSD in budget", () => {
    const result = verifyProductRequirements(product({ id: "ok", name: "OK" }), criteria);
    expect(result.overall).toBe("pass");
    expect(result.hardViolations).toHaveLength(0);
  });

  it("fails NVMe when SATA is required", () => {
    const result = verifyProductRequirements(
      product({
        id: "nvme",
        name: "NVMe",
        specs: {
          capacityGb: 1000,
          formFactor: "M.2 2280",
          interface: "NVMe PCIe Gen3",
          compatibleLaptopBay: "M.2 NVMe",
        },
      }),
      criteria,
    );
    expect(result.overall).toBe("fail");
    expect(result.hardViolations.length).toBeGreaterThan(0);
  });

  it("fails over-budget products", () => {
    const result = verifyProductRequirements(
      product({ id: "pricey", name: "Pricey", priceInr: 15000 }),
      criteria,
    );
    expect(result.overall).toBe("fail");
  });
});
