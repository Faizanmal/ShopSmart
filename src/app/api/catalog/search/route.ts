import { NextResponse } from "next/server";
import { z } from "zod";
import { mcpCallTool } from "@/lib/mcp/client";
import { createSession } from "@/lib/session/service";

const schema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  budgetMinInr: z.number().int().optional(),
  budgetMaxInr: z.number().int().optional(),
  includeOutOfBudget: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  sessionId: z.string().optional(),
});

/**
 * Catalog search HTTP facade that ALWAYS invokes MCP search_products.
 * Creates an ephemeral session when sessionId is omitted (browse-only).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    query: url.searchParams.get("query") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    brand: url.searchParams.get("brand") ?? undefined,
    budgetMinInr: url.searchParams.get("budgetMinInr")
      ? Number(url.searchParams.get("budgetMinInr"))
      : undefined,
    budgetMaxInr: url.searchParams.get("budgetMaxInr")
      ? Number(url.searchParams.get("budgetMaxInr"))
      : undefined,
    includeOutOfBudget: url.searchParams.get("includeOutOfBudget") === "true",
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20,
    sessionId: url.searchParams.get("sessionId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let sessionId = parsed.data.sessionId;
  if (!sessionId) {
    const s = await createSession("catalog-browse");
    sessionId = s.id;
  }

  const args: Record<string, unknown> = {
    sessionId,
    query: parsed.data.query,
    category: parsed.data.category,
    brand: parsed.data.brand,
    limit: parsed.data.limit,
  };
  if (!parsed.data.includeOutOfBudget) {
    if (parsed.data.budgetMinInr != null) args.budgetMinInr = parsed.data.budgetMinInr;
    if (parsed.data.budgetMaxInr != null) args.budgetMaxInr = parsed.data.budgetMaxInr;
  }

  const mcp = await mcpCallTool("search_products", args);
  if (!mcp.ok) {
    return NextResponse.json(
      {
        error: mcp.error ?? "MCP search_products failed",
        viaMcp: true,
        tool: "search_products",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ...(mcp.result as object),
    viaMcp: true,
    tool: "search_products",
    sessionId,
  });
}
