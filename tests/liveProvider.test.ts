import { describe, expect, it } from "vitest";
import { mapSerpApiResult, specsFromText } from "@/lib/catalog/liveProvider";
import { verifyProductRequirements } from "@/lib/verify/verifyRequirements";

const NOW = new Date("2026-10-21T19:00:00.000Z");

describe("SerpApi live catalog mapping", () => {
  it("maps a real Amazon.in search result to a LIVE product record", () => {
    const p = mapSerpApiResult(
      {
        asin: "B08T1SMTF9",
        title: "Samsung 870 EVO 1TB SATA 2.5 inch Internal Solid State Drive (SSD) (MZ-77E1T0)",
        link: "https://www.amazon.in/dp/B08T1SMTF9",
        thumbnail: "https://m.media-amazon.com/images/I/example.jpg",
        extracted_price: 37499,
      },
      NOW,
    );
    expect(p).not.toBeNull();
    expect(p!.id).toBe("live-b08t1smtf9");
    expect(p!.dataProvider).toBe("LIVE");
    expect(p!.priceInr).toBe(37499);
    expect(p!.retailer).toBe("Amazon.in");
    expect(p!.sourceUrl).toContain("B08T1SMTF9");
    expect(p!.lastVerifiedAt).toBe(NOW.toISOString());
    expect(p!.specs.capacityGb).toBe(1000);
    expect(p!.specs.formFactor).toBe("2.5-inch");
    expect(p!.specs.interface).toBe("SATA III");
    // Fields the API does not supply stay Unknown, never invented.
    expect(p!.seller).toBeNull();
    expect(p!.warranty).toBeNull();
    expect(p!.missingFields).toContain("seller");
    expect(p!.evidence.some((e) => e.status === "unknown")).toBe(true);
  });

  it("rejects results without ASIN, title, or price instead of inventing them", () => {
    expect(mapSerpApiResult({ title: "No asin 1TB SSD", extracted_price: 100 }, NOW)).toBeNull();
    expect(mapSerpApiResult({ asin: "B000000000", title: "No price 1TB SSD" }, NOW)).toBeNull();
  });

  it("parses specs from titles: NVMe M.2, capacity, HDD", () => {
    const nvme = specsFromText("Kingston NV2 1TB M.2 2280 NVMe PCIe Gen4 SSD up to 3500 MB/s");
    expect(nvme.formFactor).toBe("M.2 2280");
    expect(nvme.interface).toBe("NVMe PCIe Gen4");
    expect(nvme.capacityGb).toBe(1000);
    expect(specsFromText("Seagate 1TB 2.5 inch HDD SATA").mediaType).toBe("HDD");
    expect(specsFromText("Generic storage device").capacityGb).toBeUndefined();
  });

  it("live records verify against hard constraints (NVMe fails a 2.5-inch SATA brief)", () => {
    const nvme = mapSerpApiResult(
      {
        asin: "B0BBWH1R8H",
        title: "Kingston NV2 1TB M.2 2280 NVMe PCIe Internal SSD",
        extracted_price: 26743,
      },
      NOW,
    )!;
    const res = verifyProductRequirements(nvme, [
      { kind: "HARD", key: "form_factor", label: "Form factor", value: "2.5-inch" },
      { kind: "HARD", key: "interface", label: "Interface", value: "SATA" },
      { kind: "HARD", key: "capacity_gb", label: "Minimum capacity", value: "1000 GB" },
    ]);
    expect(res.overall).toBe("fail");
    expect(res.hardViolations.map((v) => v.key)).toContain("form_factor");
  });

  it("price strings with ₹ and commas parse to paise-free INR integers", () => {
    const p = mapSerpApiResult(
      { asin: "B07YD579WM", title: "Crucial BX500 1TB SATA 2.5 inch SSD", price: "₹18,500.00" },
      NOW,
    );
    expect(p!.priceInr).toBe(18500);
  });
});
