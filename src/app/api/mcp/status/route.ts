import { NextResponse } from "next/server";
import { mcpInitializeAndListTools } from "@/lib/mcp/client";
import { activeLlmProvider, anyLlmEnabled } from "@/lib/agent";

export async function GET() {
  try {
    const info = await mcpInitializeAndListTools();
    return NextResponse.json({
      ...info,
      llmConfigured: anyLlmEnabled(),
      llmProvider: activeLlmProvider(),
      consentEnforcement: "server-side (propose_cart_add / confirm_cart_add)",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mcpServerUrl: process.env.MCP_SERVER_URL ?? "http://127.0.0.1:3101/mcp",
        transport: "streamable-http",
        protocolTarget: "2025-11-25",
        error: error instanceof Error ? error.message : String(error),
        llmConfigured: anyLlmEnabled(),
      },
      { status: 503 },
    );
  }
}
