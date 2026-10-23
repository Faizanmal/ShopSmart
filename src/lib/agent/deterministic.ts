import {
  criteriaNeedsFollowUp,
  isRefinementMessage,
  mergeParsedBrief,
  parseShoppingBrief,
} from "@/lib/criteria/parseBrief";
import type { ParsedBrief } from "@/lib/criteria/types";
import { persistBrief, addTurn } from "@/lib/session/service";
import { withMcpSession, type McpCallResult } from "@/lib/mcp/client";
import { MessageRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AgentResponse, AgentToolTrace } from "./types";
import {
  classifyConfirmationIntent,
  isImmediatePurchaseAttempt,
  PURCHASE_REFUSAL_MESSAGE,
} from "@/lib/cart/confirmationIntent";

function wantsCompare(text: string) {
  return /compare|side by side|vs\b/i.test(text);
}

function wantsCartPropose(text: string) {
  return /add to cart|propose.*(cart|add)|put .* in (the )?cart/i.test(text);
}

function wantsConfirm(text: string) {
  return classifyConfirmationIntent(text) === "confirm";
}

function wantsDeny(text: string) {
  return classifyConfirmationIntent(text) === "deny";
}

function extractProductId(text: string): string | undefined {
  const m = text.match(/\b(ssd-[a-z0-9-]+|hdd-[a-z0-9-]+|live-[a-z0-9-]+)\b/i);
  return m?.[1]?.toLowerCase();
}

function pushTrace(
  trace: AgentToolTrace[],
  tool: string,
  args: Record<string, unknown>,
  res: McpCallResult,
) {
  trace.push({
    tool,
    args,
    ok: res.ok,
    result: res.result,
    error: res.error,
    viaMcp: true,
  });
  return res;
}

function pack(
  partial: Omit<AgentResponse, "verifications" | "dataProviderNotice" | "orchestration"> & {
    verifications?: Record<string, unknown>;
    dataProviderNotice?: string;
  },
): AgentResponse {
  return {
    verifications: {},
    orchestration: "deterministic",
    ...partial,
  };
}

export async function runDeterministicAgent(
  sessionId: string,
  userMessage: string,
  options?: { skipUserTurn?: boolean },
): Promise<AgentResponse> {
  const trace: AgentToolTrace[] = [];
  let products: unknown[] = [];
  const verifications: Record<string, unknown> = {};
  let comparison: unknown = null;
  let pendingProposal: unknown = null;
  let cart: unknown = null;
  let briefUpdated = false;
  let mcpConnected = true;
  let dataProviderNotice: string | undefined;

  if (!options?.skipUserTurn) {
    await addTurn(sessionId, MessageRole.USER, userMessage);
  }

  try {
    return await withMcpSession(async (mcp) => {
      const call = async (tool: string, args: Record<string, unknown>) =>
        pushTrace(trace, tool, args, await mcp.call(tool, args));

      const probe = await call("get_cart", { sessionId });
      if (probe.error?.includes("ECONNREFUSED") || probe.error?.includes("fetch failed")) {
        mcpConnected = false;
      }

      const pending = await prisma.pendingConsentAction.findFirst({
        where: { sessionId, status: "PENDING", expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });

      if (pending && (wantsConfirm(userMessage) || wantsDeny(userMessage))) {
        const approved = wantsConfirm(userMessage);
        const confirm = await call("confirm_cart_change", {
          sessionId,
          pendingActionId: pending.id,
          approved,
        });
        const cartRes = await call("get_cart", { sessionId });
        cart = cartRes.result;
        const assistantMessage = approved
          ? confirm.ok && (confirm.result as { ok?: boolean })?.ok
            ? `Confirmed. Your ShopSmart planning cart was updated. To buy, open the retailer link in the cart — ShopSmart never checks out or takes payment.`
            : `Confirmation failed: ${JSON.stringify(confirm.result)}`
          : "Cancelled. The cart was not changed.";
        await addTurn(sessionId, MessageRole.ASSISTANT, assistantMessage, trace);
        return pack({
          assistantMessage,
          briefUpdated,
          products,
          verifications,
          comparison,
          pendingProposal,
          cart,
          toolTrace: trace,
          mcpConnected,
          dataProviderNotice,
        });
      }

      if (isImmediatePurchaseAttempt(userMessage)) {
        await addTurn(sessionId, MessageRole.ASSISTANT, PURCHASE_REFUSAL_MESSAGE, trace);
        return pack({
          assistantMessage: PURCHASE_REFUSAL_MESSAGE,
          briefUpdated,
          products,
          verifications,
          comparison,
          pendingProposal,
          cart,
          toolTrace: trace,
          mcpConnected,
          dataProviderNotice,
        });
      }

      const existingBriefRow = await prisma.shoppingBrief.findUnique({
        where: { sessionId },
        include: { criteria: true },
      });
      const refinement = Boolean(existingBriefRow) && isRefinementMessage(userMessage);
      const looksLikeBrief =
        refinement ||
        /need|budget|ssd|hdd|₹|rs\.?|laptop|compare options|warranty|sata|nvme/i.test(
          userMessage,
        ) ||
        userMessage.length > 40;

      if (looksLikeBrief && !wantsCartPropose(userMessage) && !wantsConfirm(userMessage)) {
        const incoming = parseShoppingBrief(userMessage);
        let parsed: ParsedBrief = incoming;
        if (existingBriefRow && (refinement || !incoming.categoryHint)) {
          // Follow-up turn: merge into the existing ledger instead of
          // replacing it (replacing silently dropped hard constraints).
          parsed = mergeParsedBrief(
            {
              rawText: existingBriefRow.rawText,
              categoryHint: existingBriefRow.categoryHint ?? undefined,
              budgetMinInr: existingBriefRow.budgetMinInr ?? undefined,
              budgetMaxInr: existingBriefRow.budgetMaxInr ?? undefined,
              criteria: existingBriefRow.criteria.map((c) => ({
                kind: c.kind,
                key: c.key,
                label: c.label,
                value: c.value,
                sourceText: c.sourceText ?? undefined,
              })),
            },
            incoming,
          );
        }
        await persistBrief(sessionId, parsed);
        briefUpdated = true;

        const missing = criteriaNeedsFollowUp(parsed);
        // Search with the hard requirements themselves (e.g. "1TB 2.5-inch
        // SATA SSD") so live providers return relevant candidates instead of
        // generic small-capacity listings that all fail verification.
        const hardVal = (key: string) =>
          parsed.criteria.find((c) => c.key === key && c.kind === "HARD")?.value;
        const capacityGb = Number(hardVal("capacity_gb")?.replace(/[^\d]/g, "") || 0);
        const capacityTerm =
          capacityGb >= 1000 ? `${capacityGb / 1000}TB` : capacityGb ? `${capacityGb}GB` : undefined;
        const requirementQuery = [
          capacityTerm,
          hardVal("form_factor"),
          hardVal("interface"),
          parsed.categoryHint?.includes("hdd") ? "HDD" : parsed.categoryHint ? "SSD" : undefined,
        ]
          .filter(Boolean)
          .join(" ");
        const search = await call("search_products", {
          sessionId,
          query: requirementQuery || userMessage.slice(0, 80),
          category: parsed.categoryHint,
          limit: 12,
        });

        const searchResult = search.result as {
          products?: Array<{ id: string }>;
          notice?: string;
        } | null;
        products = searchResult?.products ?? [];
        dataProviderNotice = searchResult?.notice;
        mcpConnected = search.ok || mcpConnected;

        const productIds = (products as Array<{ id: string }>).map((p) => p.id);
        for (const id of productIds) {
          const v = await call("verify_product_requirements", {
            sessionId,
            productId: id,
          });
          if (v.ok && v.result) verifications[id] = v.result;
        }

        if (productIds.length >= 2) {
          const cmp = await call("compare_products", {
            sessionId,
            productIds: productIds.slice(0, 6),
          });
          comparison =
            (cmp.result as { comparison?: unknown })?.comparison ?? cmp.result;
        }

        const hard = parsed.criteria.filter((c) => c.kind === "HARD");
        const soft = parsed.criteria.filter((c) => c.kind === "SOFT");
        const unver = parsed.criteria.filter((c) => c.kind === "UNVERIFIABLE");

        const assistantMessage = [
          "I've updated your criteria ledger and searched the catalog via real MCP tool calls (single Streamable HTTP session).",
          searchResult?.notice ? `Source note: ${searchResult.notice}` : "",
          "",
          `Hard constraints (${hard.length}): ${hard.map((c) => `${c.label}=${c.value}`).join("; ") || "none"}`,
          `Soft preferences (${soft.length}): ${soft.map((c) => `${c.label}=${c.value}`).join("; ") || "none"}`,
          `Unverifiable (${unver.length}): ${unver.map((c) => c.label).join("; ") || "none"}`,
          missing.length
            ? `I still need: ${missing.join(", ")}. I will not invent these.`
            : "Essential criteria look complete enough to evaluate candidates.",
          "",
          `Verified ${Object.keys(verifications).length} candidates via verify_product_requirements; compared ${Math.min(productIds.length, 6)} via compare_products.`,
          "Hard violations are shown on cards — not hidden behind a recommendation score.",
        ]
          .filter(Boolean)
          .join("\n");

        await addTurn(sessionId, MessageRole.ASSISTANT, assistantMessage, trace);
        return pack({
          assistantMessage,
          briefUpdated,
          products,
          verifications,
          comparison,
          pendingProposal,
          cart,
          toolTrace: trace,
          mcpConnected,
          dataProviderNotice,
        });
      }

      if (wantsCartPropose(userMessage)) {
        const productId = extractProductId(userMessage);
        if (!productId) {
          const msg =
            "Tell me the exact product id to propose (for example: propose cart add ssd-crucial-mx500-1tb).";
          await addTurn(sessionId, MessageRole.ASSISTANT, msg, trace);
          return pack({
            assistantMessage: msg,
            briefUpdated,
            products,
            verifications,
            comparison,
            pendingProposal,
            cart,
            toolTrace: trace,
            mcpConnected,
            dataProviderNotice,
          });
        }
        const qtyMatch = userMessage.match(/qty(?:uantity)?\s*(\d+)/i);
        const quantity = qtyMatch ? Number(qtyMatch[1]) : 1;
        const proposal = await call("propose_cart_add", {
          sessionId,
          productId,
          quantity,
        });
        pendingProposal = proposal.result;
        const assistantMessage =
          "Created a pending cart addition via MCP propose_cart_add. The cart has NOT changed yet.";
        await addTurn(sessionId, MessageRole.ASSISTANT, assistantMessage, trace);
        return pack({
          assistantMessage,
          briefUpdated,
          products,
          verifications,
          comparison,
          pendingProposal,
          cart,
          toolTrace: trace,
          mcpConnected,
          dataProviderNotice,
        });
      }

      if (/^shortlist\s+(ssd-|hdd-)/i.test(userMessage.trim())) {
        const productId = extractProductId(userMessage);
        if (productId) {
          await call("manage_shortlist", {
            sessionId,
            action: "add",
            productId,
          });
          const msg = `Added ${productId} to your shortlist via MCP manage_shortlist.`;
          await addTurn(sessionId, MessageRole.ASSISTANT, msg, trace);
          return pack({
            assistantMessage: msg,
            briefUpdated,
            products,
            verifications,
            comparison,
            pendingProposal,
            cart,
            toolTrace: trace,
            mcpConnected,
            dataProviderNotice,
          });
        }
      }

      if (/cart|what's in my cart|show cart/i.test(userMessage)) {
        const cartRes = await call("get_cart", { sessionId });
        cart = cartRes.result;
        const assistantMessage =
          "Cart loaded via MCP get_cart. Purchase must be completed manually on the retailer website.";
        await addTurn(sessionId, MessageRole.ASSISTANT, assistantMessage, trace);
        return pack({
          assistantMessage,
          briefUpdated,
          products,
          verifications,
          comparison,
          pendingProposal,
          cart,
          toolTrace: trace,
          mcpConnected,
          dataProviderNotice,
        });
      }

      if (wantsCompare(userMessage)) {
        const ids = [...userMessage.matchAll(/\b(ssd-[a-z0-9-]+|hdd-[a-z0-9-]+)\b/gi)].map(
          (m) => m[1].toLowerCase(),
        );
        if (ids.length >= 2) {
          const cmp = await call("compare_products", {
            sessionId,
            productIds: ids.slice(0, 6),
          });
          comparison =
            (cmp.result as { comparison?: unknown })?.comparison ?? cmp.result;
          const assistantMessage = "Comparison complete via MCP compare_products.";
          await addTurn(sessionId, MessageRole.ASSISTANT, assistantMessage, trace);
          return pack({
            assistantMessage,
            briefUpdated,
            products,
            verifications,
            comparison,
            pendingProposal,
            cart,
            toolTrace: trace,
            mcpConnected,
            dataProviderNotice,
          });
        }
      }

      const fallback =
        "I can help with a shopping brief, evidence-backed search, comparison, shortlist, and consent-controlled cart proposals. All product actions use real MCP tools.";
      await addTurn(sessionId, MessageRole.ASSISTANT, fallback, trace);
      return pack({
        assistantMessage: fallback,
        briefUpdated,
        products,
        verifications,
        comparison,
        pendingProposal,
        cart,
        toolTrace: trace,
        mcpConnected,
        dataProviderNotice,
      });
    });
  } catch (error) {
    mcpConnected = false;
    const assistantMessage = `MCP connection failed: ${error instanceof Error ? error.message : String(error)}. Ensure the MCP server is running (npm run dev:mcp).`;
    await addTurn(sessionId, MessageRole.ASSISTANT, assistantMessage, trace);
    return pack({
      assistantMessage,
      briefUpdated,
      products,
      verifications,
      comparison,
      pendingProposal,
      cart,
      toolTrace: trace,
      mcpConnected: false,
      dataProviderNotice,
    });
  }
}
