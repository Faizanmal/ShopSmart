import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type McpToolInfo = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpCallResult = {
  ok: boolean;
  toolName: string;
  result: unknown;
  rawText?: string;
  error?: string;
  /** True when the response came from MCP tools/call (never a local stub). */
  viaMcp: true;
};

export type McpHandshake = {
  ok: true;
  mcpServerUrl: string;
  transport: "streamable-http";
  protocolTarget: "2025-11-25";
  serverName?: string;
  serverVersion?: string;
  protocolVersion?: string;
  tools: McpToolInfo[];
  note: string;
};

function mcpUrl() {
  return process.env.MCP_SERVER_URL ?? "http://127.0.0.1:3101/mcp";
}

function parseToolResult(rawResult: unknown): { ok: boolean; parsed: unknown; rawText: string } {
  const result = (rawResult ?? {}) as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const textParts =
    result.content
      ?.filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text) ?? [];
  const rawText = textParts.join("\n");
  let parsed: unknown = rawText;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    /* keep raw text */
  }
  return { ok: !result.isError, parsed, rawText };
}

/**
 * Open a real MCP Streamable HTTP session, run work, then close.
 * `client.connect` performs initialize + initialized notification.
 */
export async function withMcpClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl()));
  const client = new Client(
    { name: "shopsmart-web", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function mcpCallOnClient(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  try {
    const result = await client.callTool({ name, arguments: args });
    const { ok, parsed, rawText } = parseToolResult(result);
    if (!ok) {
      const errMsg =
        typeof parsed === "object" &&
        parsed &&
        "error" in parsed &&
        typeof (parsed as { error: unknown }).error === "string"
          ? (parsed as { error: string }).error
          : rawText || "MCP tool returned isError";
      return {
        ok: false,
        toolName: name,
        result: parsed,
        rawText,
        error: errMsg,
        viaMcp: true,
      };
    }
    return {
      ok: true,
      toolName: name,
      result: parsed,
      rawText,
      viaMcp: true,
    };
  } catch (error) {
    return {
      ok: false,
      toolName: name,
      result: null,
      error: error instanceof Error ? error.message : String(error),
      viaMcp: true,
    };
  }
}

export async function mcpInitializeAndListTools(): Promise<McpHandshake> {
  return withMcpClient(async (client) => {
    const tools = await client.listTools();
    const server = client.getServerVersion();
    return {
      ok: true as const,
      mcpServerUrl: mcpUrl(),
      transport: "streamable-http" as const,
      protocolTarget: "2025-11-25" as const,
      serverName: server?.name,
      serverVersion: server?.version,
      tools: tools.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      note: "Web app connected as a real MCP client (initialize + tools/list over Streamable HTTP).",
    };
  });
}

export async function mcpCallTool(
  name: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  try {
    return await withMcpClient((client) => mcpCallOnClient(client, name, args));
  } catch (error) {
    return {
      ok: false,
      toolName: name,
      result: null,
      error: error instanceof Error ? error.message : String(error),
      viaMcp: true,
    };
  }
}

/**
 * Run multiple tool calls on one MCP session (one initialize handshake).
 */
export async function mcpCallToolsSequential(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
): Promise<McpCallResult[]> {
  return withMcpClient(async (client) => {
    const out: McpCallResult[] = [];
    for (const c of calls) {
      out.push(await mcpCallOnClient(client, c.name, c.args));
    }
    return out;
  });
}

export type McpSession = {
  call: (name: string, args: Record<string, unknown>) => Promise<McpCallResult>;
  listTools: () => Promise<McpToolInfo[]>;
};

export async function withMcpSession<T>(fn: (session: McpSession) => Promise<T>): Promise<T> {
  return withMcpClient(async (client) => {
    const session: McpSession = {
      call: (name, args) => mcpCallOnClient(client, name, args),
      listTools: async () => {
        const tools = await client.listTools();
        return tools.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
      },
    };
    return fn(session);
  });
}
