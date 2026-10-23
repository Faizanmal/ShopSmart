import { isLlmOrchestrationEnabled, runLlmAgent } from "./llm";
import { isBedrockOrchestrationEnabled, runBedrockAgent } from "./bedrock";
import { runDeterministicAgent } from "./deterministic";
import { isImmediatePurchaseAttempt } from "@/lib/cart/confirmationIntent";
import type { AgentResponse } from "./types";

export type { AgentResponse, AgentToolTrace } from "./types";
export { runDeterministicAgent } from "./deterministic";
export { runLlmAgent, isLlmOrchestrationEnabled } from "./llm";
export { runBedrockAgent, isBedrockOrchestrationEnabled } from "./bedrock";

/** Active LLM provider name for status reporting ("none" | "openai" | "bedrock"). */
export function activeLlmProvider(): string {
  if (isBedrockOrchestrationEnabled()) return "bedrock";
  if (isLlmOrchestrationEnabled()) return process.env.LLM_PROVIDER ?? "openai";
  return "none";
}

export function anyLlmEnabled(): boolean {
  return isBedrockOrchestrationEnabled() || isLlmOrchestrationEnabled();
}

/**
 * Entry point for chat: Bedrock or OpenAI when configured, else deterministic
 * MCP orchestration. Consent is never enforced by a model — only by
 * server-side cart tools.
 */
export async function runShoppingAgent(
  sessionId: string,
  userMessage: string,
): Promise<AgentResponse> {
  // Purchase/checkout attempts always take the deterministic refusal path —
  // a model must never pretend to buy.
  if (isImmediatePurchaseAttempt(userMessage)) {
    const det = await runDeterministicAgent(sessionId, userMessage);
    return { ...det, orchestration: "deterministic" };
  }
  if (isBedrockOrchestrationEnabled()) {
    return runBedrockAgent(sessionId, userMessage);
  }
  if (isLlmOrchestrationEnabled()) {
    return runLlmAgent(sessionId, userMessage);
  }
  const det = await runDeterministicAgent(sessionId, userMessage);
  return { ...det, orchestration: "deterministic" };
}
