import { afterEach, describe, expect, it } from "vitest";
import { bedrockConfig, isBedrockOrchestrationEnabled, runBedrockAgent } from "@/lib/agent/bedrock";
import { isLlmToolAllowed } from "@/lib/agent/llm";

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("Amazon Bedrock orchestration config", () => {
  it("disabled unless LLM_PROVIDER=bedrock", () => {
    process.env.LLM_PROVIDER = "none";
    expect(isBedrockOrchestrationEnabled()).toBe(false);
    process.env.LLM_PROVIDER = "bedrock";
    expect(isBedrockOrchestrationEnabled()).toBe(true);
    const cfg = bedrockConfig();
    expect(cfg.modelId).toBeTruthy();
    expect(cfg.region).toBeTruthy();
  });

  it("model can never call confirm or purchase tools (same guard as OpenAI path)", () => {
    expect(isLlmToolAllowed("confirm_cart_add")).toBe(false);
    expect(isLlmToolAllowed("confirm_cart_change")).toBe(false);
    expect(isLlmToolAllowed("checkout")).toBe(false);
    expect(isLlmToolAllowed("propose_cart_add")).toBe(true);
    expect(isLlmToolAllowed("search_products")).toBe(true);
  });

  it("runBedrockAgent with bedrock disabled delegates to deterministic orchestration", async () => {
    process.env.LLM_PROVIDER = "none";
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const s = await prisma.shoppingSession.create({ data: { title: "bedrock-disabled" } });
    await prisma.$disconnect();
    const res = await runBedrockAgent(s.id, "show cart");
    expect(res.orchestration).toBe("deterministic");
  });
});
