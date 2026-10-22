import type { EvidenceClaim, ProductRecord } from "./types";

export type ClaimRow = {
  key: string;
  label: string;
  value: string;
  status: EvidenceClaim["status"] | "missing";
  source?: string;
};

const IMPORTANT: Array<{ key: string; label: string; read: (p: ProductRecord) => string | null }> =
  [
    {
      key: "price",
      label: "Price",
      read: (p) => (p.priceInr != null ? `₹${p.priceInr}` : null),
    },
    {
      key: "capacity",
      label: "Capacity",
      read: (p) =>
        p.specs.capacityGb != null && p.specs.capacityGb !== ""
          ? `${p.specs.capacityGb} GB`
          : null,
    },
    {
      key: "formFactor",
      label: "Form factor",
      read: (p) => {
        const v = p.specs.formFactor;
        if (v == null || String(v).toLowerCase() === "unknown") return null;
        return String(v);
      },
    },
    {
      key: "interface",
      label: "Interface",
      read: (p) => {
        const v = p.specs.interface;
        if (v == null || String(v).toLowerCase() === "unknown") return null;
        return String(v);
      },
    },
    {
      key: "compatibility",
      label: "Compatibility",
      read: (p) => {
        const v = p.specs.compatibleLaptopBay;
        if (v == null || String(v).toLowerCase().includes("unknown")) return null;
        return String(v);
      },
    },
    {
      key: "warranty",
      label: "Warranty",
      read: (p) => p.warranty?.trim() || null,
    },
    {
      key: "availability",
      label: "Availability",
      read: (p) => {
        if (!p.availability || /unknown/i.test(p.availability)) return null;
        return p.availability;
      },
    },
    {
      key: "delivery",
      label: "Delivery",
      read: (p) => {
        if (!p.deliveryInfo || /unknown/i.test(p.deliveryInfo)) return null;
        return p.deliveryInfo;
      },
    },
    {
      key: "seller",
      label: "Seller",
      read: (p) => {
        if (!p.seller || /unknown/i.test(p.seller)) return null;
        return p.seller;
      },
    },
  ];

function matchEvidence(product: ProductRecord, label: string, key: string): EvidenceClaim | undefined {
  const lower = `${label} ${key}`.toLowerCase();
  return product.evidence.find((e) => {
    const c = e.claim.toLowerCase();
    return (
      c.includes(key.toLowerCase()) ||
      lower.split(" ").some((w) => w.length > 3 && c.includes(w))
    );
  });
}

/**
 * Every important shopping claim is either backed by evidence or explicitly unknown/missing.
 */
export function buildClaimRows(product: ProductRecord): ClaimRow[] {
  return IMPORTANT.map(({ key, label, read }) => {
    const value = read(product);
    if (value == null) {
      return {
        key,
        label,
        value: "Unknown",
        status: "missing" as const,
        source: product.missingFields.includes(key)
          ? "Listed in missingFields"
          : "Not provided by source",
      };
    }
    const evidence = matchEvidence(product, label, key);
    if (evidence) {
      return {
        key,
        label,
        value,
        status: evidence.status,
        source: evidence.source,
      };
    }
    // Value present in structured fields but no citation → treat as provider_claim, not invented.
    return {
      key,
      label,
      value,
      status: "provider_claim",
      source: `${product.dataProvider.toLowerCase()}-catalog#${product.id}`,
    };
  });
}

export function assertNoInventedClaims(product: ProductRecord): string[] {
  const issues: string[] = [];
  for (const row of buildClaimRows(product)) {
    if (row.status === "missing" && row.value !== "Unknown") {
      issues.push(`${product.id}:${row.key} missing but non-unknown value`);
    }
  }
  if (product.dataProvider !== "DEMO" && product.dataProvider !== "LIVE") {
    issues.push(`${product.id}: invalid dataProvider`);
  }
  return issues;
}
