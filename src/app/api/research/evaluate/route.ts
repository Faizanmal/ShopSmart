import { NextResponse } from "next/server";
import { z } from "zod";
import { withMcpSession } from "@/lib/mcp/client";
import { prisma } from "@/lib/db";

const schema = z.object({
  sessionId: z.string(),
  productIds: z.array(z.string()).min(1).max(12).optional(),
  compare: z.boolean().optional(),
});

/**
 * Research evaluate — proxies exclusively through MCP tools (not a fake MCP REST).
 * Flow: search_products and/or get_product_details → verify_product_requirements → compare_products
 */
export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const session = await prisma.shoppingSession.findUnique({
      where: { id: body.sessionId },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const toolTrace: Array<{
      tool: string;
      ok: boolean;
      error?: string;
      viaMcp: true;
    }> = [];

    const result = await withMcpSession(async (mcp) => {
      let products: unknown[] = [];
      const verifications: Record<string, unknown> = {};
      let comparison: unknown = null;
      let notice: string | undefined;
      let dataProvider: string | undefined;

      if (body.productIds?.length) {
        for (const productId of body.productIds) {
          const details = await mcp.call("get_product_details", {
            sessionId: body.sessionId,
            productId,
          });
          toolTrace.push({
            tool: "get_product_details",
            ok: details.ok,
            error: details.error,
            viaMcp: true,
          });
          if (details.ok) {
            const p = (details.result as { product?: unknown }).product;
            if (p) products.push(p);
          }
        }
      } else {
        const brief = await prisma.shoppingBrief.findUnique({
          where: { sessionId: body.sessionId },
        });
        const search = await mcp.call("search_products", {
          sessionId: body.sessionId,
          query: "SSD",
          category: brief?.categoryHint ?? "internal-ssd",
          limit: 12,
        });
        toolTrace.push({
          tool: "search_products",
          ok: search.ok,
          error: search.error,
          viaMcp: true,
        });
        const sr = search.result as {
          products?: unknown[];
          notice?: string;
          dataProvider?: string;
        };
        products = sr.products ?? [];
        notice = sr.notice;
        dataProvider = sr.dataProvider;
      }

      const ids = (
        products as Array<{ id?: string }>
      )
        .map((p) => p.id)
        .filter((id): id is string => Boolean(id));

      for (const productId of ids) {
        const v = await mcp.call("verify_product_requirements", {
          sessionId: body.sessionId,
          productId,
        });
        toolTrace.push({
          tool: "verify_product_requirements",
          ok: v.ok,
          error: v.error,
          viaMcp: true,
        });
        if (v.ok) verifications[productId] = v.result;
      }

      if (body.compare && ids.length >= 2) {
        const cmp = await mcp.call("compare_products", {
          sessionId: body.sessionId,
          productIds: ids.slice(0, 6),
        });
        toolTrace.push({
          tool: "compare_products",
          ok: cmp.ok,
          error: cmp.error,
          viaMcp: true,
        });
        comparison =
          (cmp.result as { comparison?: unknown })?.comparison ?? cmp.result;
      }

      return {
        dataProvider: dataProvider ?? "DEMO",
        notice:
          notice ??
          "Results obtained via MCP Streamable HTTP tools (not a local REST stub).",
        products,
        verifications,
        comparison,
        criteriaCount: (
          await prisma.criterion.count({
            where: { brief: { sessionId: body.sessionId } },
          })
        ),
        toolTrace,
        viaMcp: true as const,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        viaMcp: false,
      },
      { status: 503 },
    );
  }
}
