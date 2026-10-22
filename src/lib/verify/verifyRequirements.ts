import type { ParsedCriterion } from "@/lib/criteria/types";
import type { ProductRecord } from "@/lib/catalog/types";

export type RequirementStatus = "satisfied" | "violated" | "unverifiable";

export type RequirementCheck = {
  key: string;
  label: string;
  expected: string;
  status: RequirementStatus;
  evidence: string;
};

export type VerificationResult = {
  productId: string;
  overall: "pass" | "fail" | "uncertain";
  hardViolations: RequirementCheck[];
  checks: RequirementCheck[];
};

function specString(product: ProductRecord, key: string): string | undefined {
  const v = product.specs[key];
  if (v == null) return undefined;
  return String(v);
}

function checkOne(product: ProductRecord, c: ParsedCriterion): RequirementCheck | null {
  if (c.kind === "SOFT" || c.kind === "MISSING") return null;
  if (c.kind === "UNVERIFIABLE") {
    return {
      key: c.key,
      label: c.label,
      expected: c.value,
      status: "unverifiable",
      evidence: "Constraint cannot be verified with available catalog evidence.",
    };
  }

  switch (c.key) {
    case "budget_min": {
      const min = Number(c.value.replace(/[₹,\s]/g, ""));
      const ok = product.priceInr >= min;
      return {
        key: c.key,
        label: c.label,
        expected: c.value,
        status: ok ? "satisfied" : "violated",
        evidence: `Known price ₹${product.priceInr}`,
      };
    }
    case "budget_max": {
      const max = Number(c.value.replace(/[₹,\s]/g, ""));
      const ok = product.priceInr <= max;
      return {
        key: c.key,
        label: c.label,
        expected: c.value,
        status: ok ? "satisfied" : "violated",
        evidence: `Known price ₹${product.priceInr}`,
      };
    }
    case "media_type": {
      const media = specString(product, "mediaType");
      if (c.value.toUpperCase() === "SSD") {
        if (product.category.includes("ssd") && media !== "HDD") {
          return {
            key: c.key,
            label: c.label,
            expected: c.value,
            status: "satisfied",
            evidence: `Category ${product.category}`,
          };
        }
        if (product.category.includes("hdd") || media === "HDD") {
          return {
            key: c.key,
            label: c.label,
            expected: c.value,
            status: "violated",
            evidence: "Product is an HDD, not an SSD",
          };
        }
      }
      return {
        key: c.key,
        label: c.label,
        expected: c.value,
        status: "unverifiable",
        evidence: "Media type not clearly labeled",
      };
    }
    case "capacity_gb": {
      const required = Number(c.value.replace(/[^\d.]/g, ""));
      const actual = Number(specString(product, "capacityGb"));
      if (!actual) {
        return {
          key: c.key,
          label: c.label,
          expected: c.value,
          status: "unverifiable",
          evidence: "Capacity missing from product specs",
        };
      }
      return {
        key: c.key,
        label: c.label,
        expected: c.value,
        status: actual >= required ? "satisfied" : "violated",
        evidence: `Listed capacity ${actual} GB`,
      };
    }
    case "form_factor": {
      const form = (specString(product, "formFactor") ?? "").toLowerCase();
      if (!form || form === "unknown") {
        return {
          key: c.key,
          label: c.label,
          expected: c.value,
          status: "unverifiable",
          evidence: "Form factor not provided",
        };
      }
      const want = c.value.toLowerCase();
      const ok =
        (want.includes("2.5") && form.includes("2.5")) ||
        (want.includes("m.2") && form.includes("m.2"));
      return {
        key: c.key,
        label: c.label,
        expected: c.value,
        status: ok ? "satisfied" : "violated",
        evidence: `Listed form factor: ${form}`,
      };
    }
    case "interface": {
      const iface = (specString(product, "interface") ?? "").toLowerCase();
      if (!iface || iface === "unknown") {
        return {
          key: c.key,
          label: c.label,
          expected: c.value,
          status: "unverifiable",
          evidence: "Interface not provided",
        };
      }
      const want = c.value.toLowerCase();
      const ok =
        (want.includes("sata") && iface.includes("sata")) ||
        (want.includes("nvme") && iface.includes("nvme"));
      return {
        key: c.key,
        label: c.label,
        expected: c.value,
        status: ok ? "satisfied" : "violated",
        evidence: `Listed interface: ${iface}`,
      };
    }
    case "compatibility": {
      const bay = (specString(product, "compatibleLaptopBay") ?? "").toLowerCase();
      if (!bay || bay.includes("unknown")) {
        return {
          key: c.key,
          label: c.label,
          expected: c.value,
          status: "unverifiable",
          evidence: "Compatibility bay not documented",
        };
      }
      const want = c.value.toLowerCase();
      const ok =
        want.includes("2.5") &&
        want.includes("sata") &&
        bay.includes("2.5") &&
        bay.includes("sata");
      return {
        key: c.key,
        label: c.label,
        expected: c.value,
        status: ok ? "satisfied" : "violated",
        evidence: `Listed compatibility: ${bay}`,
      };
    }
    case "exclude_brand": {
      const excluded = c.value.toLowerCase();
      const ok = product.brand.toLowerCase() !== excluded;
      return {
        key: c.key,
        label: c.label,
        expected: c.value,
        status: ok ? "satisfied" : "violated",
        evidence: `Brand is ${product.brand}`,
      };
    }
    default:
      return {
        key: c.key,
        label: c.label,
        expected: c.value,
        status: "unverifiable",
        evidence: "No automated checker for this constraint",
      };
  }
}

export function verifyProductRequirements(
  product: ProductRecord,
  criteria: ParsedCriterion[],
): VerificationResult {
  const hard = criteria.filter((c) => c.kind === "HARD" || c.kind === "UNVERIFIABLE");
  const checks = hard
    .map((c) => checkOne(product, c))
    .filter((x): x is RequirementCheck => x != null);

  const hardViolations = checks.filter(
    (c) => c.status === "violated" && criteria.find((x) => x.key === c.key)?.kind === "HARD",
  );
  const hardUnverifiable = checks.filter(
    (c) =>
      c.status === "unverifiable" && criteria.find((x) => x.key === c.key)?.kind === "HARD",
  );

  let overall: VerificationResult["overall"] = "pass";
  if (hardViolations.length > 0) overall = "fail";
  else if (hardUnverifiable.length > 0) overall = "uncertain";

  return {
    productId: product.id,
    overall,
    hardViolations,
    checks,
  };
}
