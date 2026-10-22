import { NextResponse } from "next/server";
import { z } from "zod";
import { runShoppingAgent, isLlmOrchestrationEnabled } from "@/lib/agent";
import { getSessionBundle } from "@/lib/session/service";

const bodySchema = z.object({
  sessionId: z.string(),
  message: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const session = await getSessionBundle(body.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const result = await runShoppingAgent(body.sessionId, body.message);
    const refreshed = await getSessionBundle(body.sessionId);

    return NextResponse.json({
      ...result,
      session: refreshed,
      llmProvider: isLlmOrchestrationEnabled()
        ? process.env.LLM_PROVIDER ?? "openai"
        : "none",
      llmConfigured: isLlmOrchestrationEnabled(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
