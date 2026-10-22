import { describe, expect, it } from "vitest";
import {
  isRefinementMessage,
  mergeParsedBrief,
  parseShoppingBrief,
} from "@/lib/criteria/parseBrief";

const BRIEF =
  "I need a reliable 1 TB internal SSD for a laptop that supports a 2.5-inch SATA drive. My budget is ₹7,000–₹10,000. Compare options from approved Indian retailers, prioritize reliable products and warranty, and flag compatibility or seller details you cannot verify.";

describe("budget parsing without a ₹ symbol", () => {
  it("parses '7000-10000 rupees' as a hard budget range", () => {
    const parsed = parseShoppingBrief("I need a 1 TB SSD, budget 7000-10000 rupees");
    expect(parsed.budgetMinInr).toBe(7000);
    expect(parsed.budgetMaxInr).toBe(10000);
    expect(parsed.criteria.some((c) => c.kind === "MISSING" && c.key === "budget")).toBe(false);
  });

  it("parses 'under Rs 6000'", () => {
    const parsed = parseShoppingBrief("change my budget to under Rs 6000");
    expect(parsed.budgetMaxInr).toBe(6000);
  });
});

describe("exclude-brand parsing safety", () => {
  it("'cannot verify' in a brief does not create an exclude_brand criterion", () => {
    const parsed = parseShoppingBrief(BRIEF);
    expect(parsed.criteria.some((c) => c.key === "exclude_brand")).toBe(false);
  });
});

describe("refinement merge (follow-up turns must not wipe hard constraints)", () => {
  it("detects refinement language", () => {
    expect(isRefinementMessage("exclude Samsung")).toBe(true);
    expect(isRefinementMessage("actually change my budget to under 6000")).toBe(true);
    expect(isRefinementMessage("I need a new SSD")).toBe(false);
  });

  it("'exclude Samsung' adds exclude_brand and keeps capacity/form/interface/compatibility", () => {
    const existing = parseShoppingBrief(BRIEF);
    const merged = mergeParsedBrief(existing, parseShoppingBrief("exclude Samsung"));
    const hard = merged.criteria.filter((c) => c.kind === "HARD");
    expect(hard.some((c) => c.key === "exclude_brand" && c.value === "samsung")).toBe(true);
    expect(hard.some((c) => c.key === "capacity_gb")).toBe(true);
    expect(hard.some((c) => c.key === "form_factor")).toBe(true);
    expect(hard.some((c) => c.key === "interface")).toBe(true);
    expect(hard.some((c) => c.key === "compatibility")).toBe(true);
    expect(merged.budgetMinInr).toBe(7000);
    expect(merged.budgetMaxInr).toBe(10000);
  });

  it("'under ₹6,000' replaces the budget as a unit and keeps other hard constraints", () => {
    const existing = parseShoppingBrief(BRIEF);
    const merged = mergeParsedBrief(
      existing,
      parseShoppingBrief("actually change my budget to under ₹6,000"),
    );
    expect(merged.budgetMaxInr).toBe(6000);
    // Stale ₹7,000 minimum must not survive (would make the range impossible).
    expect(merged.budgetMinInr).toBeUndefined();
    const hardKeys = merged.criteria.filter((c) => c.kind === "HARD").map((c) => c.key);
    expect(hardKeys).toContain("capacity_gb");
    expect(hardKeys).toContain("form_factor");
    expect(hardKeys).toContain("interface");
    expect(hardKeys).toContain("compatibility");
    expect(hardKeys).not.toContain("budget_min");
    // No bogus MISSING budget/category may reappear after the merge.
    expect(merged.criteria.some((c) => c.kind === "MISSING")).toBe(false);
  });

  it("a follow-up with no category does not resurrect MISSING category", () => {
    const existing = parseShoppingBrief(BRIEF);
    const merged = mergeParsedBrief(existing, parseShoppingBrief("exclude Samsung"));
    expect(merged.criteria.some((c) => c.kind === "MISSING" && c.key === "category")).toBe(false);
    expect(merged.categoryHint).toBe("internal-ssd");
  });
});
