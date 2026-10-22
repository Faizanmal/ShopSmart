import { NextResponse } from "next/server";
import { z } from "zod";
import { mcpCallTool } from "@/lib/mcp/client";

const schema = z.object({
  sessionId: z.string(),
  pendingActionId: z.string(),
  approved: z.boolean(),
});

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  // confirm_cart_change validates ANY pending cart action (add / update /
  // remove) server-side: session-bound, fingerprinted, unexpired, single-use.
  // Using confirm_cart_add here would reject update/remove proposals.
  const result = await mcpCallTool("confirm_cart_change", body);
  const cart = await mcpCallTool("get_cart", { sessionId: body.sessionId });
  return NextResponse.json({ confirm: result, cart: cart.result });
}
