export type AgentToolTrace = {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  result: unknown;
  error?: string;
  viaMcp?: boolean;
};

export type AgentResponse = {
  assistantMessage: string;
  briefUpdated: boolean;
  products: unknown[];
  verifications: Record<string, unknown>;
  comparison: unknown;
  pendingProposal: unknown;
  cart: unknown;
  toolTrace: AgentToolTrace[];
  mcpConnected: boolean;
  dataProviderNotice?: string;
  orchestration: "deterministic" | "llm";
  llmModel?: string;
};
