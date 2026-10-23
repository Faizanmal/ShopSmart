import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { executeTool } from "../src/lib/mcp/tools";

const PORT = Number(process.env.MCP_PORT ?? 3101);
const ALLOWED_ORIGINS = (
  process.env.MCP_ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function createShopSmartServer() {
  const server = new McpServer(
    {
      name: "shopsmart-mcp",
      version: "1.0.0",
    },
    {
      instructions:
        "ShopSmart MCP tools for evidence-backed shopping. propose_cart_add never mutates the cart; confirm_cart_change requires explicit approval of a pending action. Never place orders or take payment — buying is via the retailer link in the cart.",
    },
  );

  const wrap = (name: string) => async (args: Record<string, unknown>) => {
    try {
      const result = await executeTool(name, args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
      };
    }
  };

  server.registerTool(
    "search_products",
    {
      description:
        "Search the product catalog (demo by default). Returns structured products with evidence metadata.",
      inputSchema: {
        sessionId: z.string(),
        query: z.string().optional(),
        category: z.string().optional(),
        budgetMinInr: z.number().int().optional(),
        budgetMaxInr: z.number().int().optional(),
        brand: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    wrap("search_products"),
  );

  server.registerTool(
    "get_product_details",
    {
      description: "Get full details for a product id.",
      inputSchema: {
        sessionId: z.string(),
        productId: z.string(),
      },
    },
    wrap("get_product_details"),
  );

  server.registerTool(
    "verify_product_requirements",
    {
      description:
        "Verify a product against the session shopping brief hard/soft constraints.",
      inputSchema: {
        sessionId: z.string(),
        productId: z.string(),
      },
    },
    wrap("verify_product_requirements"),
  );

  server.registerTool(
    "compare_products",
    {
      description: "Compare 2–6 products with deterministic ranking and evidence.",
      inputSchema: {
        sessionId: z.string(),
        productIds: z.array(z.string()).min(2).max(6),
      },
    },
    wrap("compare_products"),
  );

  server.registerTool(
    "manage_shortlist",
    {
      description: "Add, remove, or list shortlisted products for a session.",
      inputSchema: {
        sessionId: z.string(),
        action: z.enum(["add", "remove", "list"]),
        productId: z.string().optional(),
        note: z.string().optional(),
      },
    },
    wrap("manage_shortlist"),
  );

  server.registerTool(
    "propose_cart_add",
    {
      description:
        "Create a pending cart-add consent action. Does NOT mutate the cart.",
      inputSchema: {
        sessionId: z.string(),
        productId: z.string(),
        quantity: z.number().int().min(1).max(20).default(1),
        variant: z.string().optional(),
      },
    },
    wrap("propose_cart_add"),
  );

  server.registerTool(
    "confirm_cart_add",
    {
      description:
        "Confirm or deny a pending cart-add. Only approved + valid pending actions mutate the cart.",
      inputSchema: {
        sessionId: z.string(),
        pendingActionId: z.string(),
        approved: z.boolean(),
      },
    },
    wrap("confirm_cart_add"),
  );

  server.registerTool(
    "get_cart",
    {
      description: "Get the ShopSmart planning cart for a session.",
      inputSchema: {
        sessionId: z.string(),
      },
    },
    wrap("get_cart"),
  );

  server.registerTool(
    "propose_cart_update",
    {
      description:
        "Create a pending cart quantity-update consent action. Does NOT mutate the cart. Confirm via confirm_cart_change.",
      inputSchema: {
        sessionId: z.string(),
        cartItemId: z.string(),
        quantity: z.number().int().min(1).max(20),
      },
    },
    wrap("propose_cart_update"),
  );

  server.registerTool(
    "propose_cart_remove",
    {
      description:
        "Create a pending cart-removal consent action. Does NOT mutate the cart. Confirm via confirm_cart_change.",
      inputSchema: {
        sessionId: z.string(),
        cartItemId: z.string(),
      },
    },
    wrap("propose_cart_remove"),
  );

  server.registerTool(
    "confirm_cart_change",
    {
      description:
        "Confirm/deny a pending cart change (add/update/remove). Only a valid, unexpired, session-bound pending action mutates the cart, exactly once.",
      inputSchema: {
        sessionId: z.string(),
        pendingActionId: z.string(),
        approved: z.boolean(),
      },
    },
    wrap("confirm_cart_change"),
  );

  server.registerTool(
    "update_cart_item",
    {
      description:
        "Deprecated alias: creates a pending quantity-update proposal (no mutation). Confirm via confirm_cart_change.",
      inputSchema: {
        sessionId: z.string(),
        cartItemId: z.string(),
        quantity: z.number().int().min(1).max(20),
      },
    },
    wrap("update_cart_item"),
  );

  server.registerTool(
    "remove_cart_item",
    {
      description:
        "Deprecated alias: creates a pending removal proposal (no mutation). Confirm via confirm_cart_change.",
      inputSchema: {
        sessionId: z.string(),
        cartItemId: z.string(),
      },
    },
    wrap("remove_cart_item"),
  );

  return server;
}

const app = express();
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin not allowed: ${origin}`));
    },
    exposedHeaders: ["Mcp-Session-Id"],
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "shopsmart-mcp",
    transport: "streamable-http",
    protocolTarget: "2025-11-25",
  });
});

const transports: Record<string, StreamableHTTPServerTransport> = {};

function originAllowed(req: express.Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

app.post("/mcp", async (req, res) => {
  if (!originAllowed(req)) {
    res.status(403).json({ error: "Forbidden origin" });
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  try {
    let transport = sessionId ? transports[sessionId] : undefined;

    if (transport) {
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const server = createShopSmartServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        // Prefer JSON responses for request/response tool calls (Streamable HTTP).
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          transports[id] = transport!;
        },
      });
      transport.onclose = () => {
        const id = transport?.sessionId;
        if (id) delete transports[id];
      };
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: No valid session" },
      id: null,
    });
  } catch (error) {
    console.error("[mcp] POST error", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  if (!originAllowed(req)) {
    res.status(403).json({ error: "Forbidden origin" });
    return;
  }
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports[sessionId] : undefined;
  if (transport) {
    await transport.close();
    delete transports[sessionId!];
  }
  res.status(200).end();
});

const HOST = process.env.MCP_HOST ?? "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`ShopSmart MCP server (Streamable HTTP) on http://${HOST}:${PORT}/mcp`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
