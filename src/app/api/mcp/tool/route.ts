import { NextResponse } from "next/server";
import { z } from "zod";
import { mcpCallTool } from "@/lib/mcp/client";
import { isHttpProxyToolAllowed } from "@/lib/mcp/httpProxyAllowlist";

const schema = z.object({
  name: z.string(),
  args: z.record(z.unknown()),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    if (!isHttpProxyToolAllowed(body.name)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `Tool '${body.name}' is not callable via /api/mcp/tool. ` +
            "Cart confirmations must go through POST /api/cart/confirm (explicit user approval of a specific pending action); purchase/checkout tools do not exist.",
          code: "tool_not_allowed_via_http_proxy",
        },
        { status: 403 },
      );
    }
    const result = await mcpCallTool(body.name, body.args);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
