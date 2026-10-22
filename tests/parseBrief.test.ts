import { describe, expect, it } from "vitest";
import { parseShoppingBrief } from "@/lib/criteria/parseBrief";

describe("parseShoppingBrief", () => {
  it("extracts hard SSD constraints and budget for the demo brief", () => {
    const brief = parseShoppingBrief(
      "I need a reliable 1 TB internal SSD for a laptop that supports a 2.5-inch SATA drive. My budget is ₹7,000–₹10,000.",
    );
    expect(brief.budgetMinInr).toBe(7000);
    expect(brief.budgetMaxInr).toBe(10000);
    expect(brief.criteria.some((c) => c.kind === "HARD" && c.key === "capacity_gb")).toBe(true);
    expect(brief.criteria.some((c) => c.kind === "HARD" && c.key === "interface")).toBe(true);
    expect(brief.criteria.some((c) => c.kind === "HARD" && c.key === "form_factor")).toBe(true);
    expect(brief.criteria.some((c) => c.kind === "SOFT" && c.key === "prefer_warranty")).toBe(true);
    expect(brief.criteria.some((c) => c.kind === "UNVERIFIABLE")).toBe(true);
  });

  it("does not invent a budget when absent", () => {
    const brief = parseShoppingBrief("I need an SSD for my laptop");
    expect(brief.budgetMaxInr).toBeUndefined();
    expect(brief.criteria.some((c) => c.kind === "MISSING" && c.key === "budget")).toBe(true);
  });
});
