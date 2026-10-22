import { afterEach, describe, expect, it } from "vitest";
import { isLlmOrchestrationEnabled, runLlmAgent } from "@/lib/agent/llm";
import { mcpCallTool } from "@/lib/mcp/client";
import { verifyProductRequirements } from "@/lib/verify/verifyRequirements";
import { buildClaimRows } from "@/lib/catalog/claims";
import type { ProductRecord } from "@/lib/catalog/types";

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("missing API keys", () => {
  it("no LLM key → LLM orchestration disabled, deterministic fallback is selected", async () => {
    process.env.LLM_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    expect(isLlmOrchestrationEnabled()).toBe(false);
  });

  it("runLlmAgent without a key delegates to deterministic MCP orchestration", async () => {
    process.env.LLM_PROVIDER = "none";
    delete process.env.OPENAI_API_KEY;
    // Needs DB/MCP; only assert orchestration label when infra is present.
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const s = await prisma.shoppingSession.create({ data: { title: "no-key-fallback" } });
    await prisma.$disconnect();
    const res = await runLlmAgent(s.id, "show cart");
    expect(res.orchestration).toBe("deterministic");
  });
});

describe("failed network requests", () => {
  it("MCP call to a dead server returns ok:false instead of throwing or faking success", async () => {
    process.env.MCP_SERVER_URL = "http://127.0.0.1:9/mcp";
    const res = await mcpCallTool("search_products", { sessionId: "x", query: "SSD" });
    expect(res.ok).toBe(false);
    expect(res.viaMcp).toBe(true);
    expect(res.error).toBeTruthy();
    expect(res.result).toBeNull();
  });
});

describe("invalid / incomplete provider responses", () => {
  const malformed = {
    id: "bad-1",
    name: "Malformed product",
    brand: "Bad",
    model: null,
    variant: null,
    category: "internal-ssd",
    description: "",
    priceInr: 1000,
    currency: "INR",
    imageUrl: null,
    sourceUrl: "https://example.invalid",
    retailer: "Demo",
    seller: null,
    availability: null,
    specs: {}, // every spec missing
    warranty: null,
    deliveryInfo: null,
    evidence: [],
    missingFields: [],
    conflictingFields: [],
    dataProvider: "DEMO",
    lastVerifiedAt: new Date().toISOString(),
  } as unknown as ProductRecord;

  it("verification marks everything unverifiable instead of crashing or passing", () => {
    const result = verifyProductRequirements(malformed, [
      { kind: "HARD", key: "capacity_gb", label: "Minimum capacity", value: "1000 GB" },
      { kind: "HARD", key: "interface", label: "Interface", value: "SATA" },
      { kind: "HARD", key: "form_factor", label: "Form factor", value: "2.5-inch" },
    ]);
    expect(result.overall).toBe("uncertain");
    expect(result.hardViolations).toHaveLength(0);
    expect(result.checks.every((c) => c.status === "unverifiable")).toBe(true);
  });

  it("claim rows label missing provider fields Unknown", () => {
    const rows = buildClaimRows(malformed);
    for (const key of ["capacity", "formFactor", "interface", "warranty", "seller"]) {
      const row = rows.find((r) => r.key === key)!;
      expect(row.value).toBe("Unknown");
      expect(row.status).toBe("missing");
    }
  });

  it("garbage spec types do not crash verification", () => {
    const garbage = {
      ...malformed,
      specs: { capacityGb: "lots", formFactor: 42, interface: null },
    } as unknown as ProductRecord;
    const result = verifyProductRequirements(garbage, [
      { kind: "HARD", key: "capacity_gb", label: "Minimum capacity", value: "1000 GB" },
    ]);
    expect(["uncertain", "fail"]).toContain(result.overall);
  });
});
