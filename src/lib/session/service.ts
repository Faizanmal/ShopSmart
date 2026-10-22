import { CriterionKind, MessageRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseShoppingBrief } from "@/lib/criteria/parseBrief";
import type { ParsedBrief } from "@/lib/criteria/types";

export async function createSession(title?: string) {
  return prisma.shoppingSession.create({
    data: {
      title: title ?? "New shopping session",
      locale: "en-IN",
      currency: "INR",
    },
  });
}

export async function getSessionBundle(sessionId: string) {
  return prisma.shoppingSession.findUnique({
    where: { id: sessionId },
    include: {
      turns: { orderBy: { createdAt: "asc" } },
      brief: { include: { criteria: true } },
      shortlist: { include: { product: true }, orderBy: { createdAt: "asc" } },
      cartItems: { include: { product: true }, orderBy: { addedAt: "asc" } },
      pendingActions: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function upsertBriefFromText(sessionId: string, rawText: string) {
  const parsed = parseShoppingBrief(rawText);
  return persistBrief(sessionId, parsed);
}

export async function persistBrief(sessionId: string, parsed: ParsedBrief) {
  const existing = await prisma.shoppingBrief.findUnique({ where: { sessionId } });

  if (existing) {
    await prisma.criterion.deleteMany({ where: { briefId: existing.id } });
    return prisma.shoppingBrief.update({
      where: { id: existing.id },
      data: {
        rawText: parsed.rawText,
        categoryHint: parsed.categoryHint,
        budgetMinInr: parsed.budgetMinInr,
        budgetMaxInr: parsed.budgetMaxInr,
        criteria: {
          create: parsed.criteria.map((c) => ({
            kind: c.kind as CriterionKind,
            key: c.key,
            label: c.label,
            value: c.value,
            sourceText: c.sourceText,
          })),
        },
      },
      include: { criteria: true },
    });
  }

  return prisma.shoppingBrief.create({
    data: {
      sessionId,
      rawText: parsed.rawText,
      categoryHint: parsed.categoryHint,
      budgetMinInr: parsed.budgetMinInr,
      budgetMaxInr: parsed.budgetMaxInr,
      criteria: {
        create: parsed.criteria.map((c) => ({
          kind: c.kind as CriterionKind,
          key: c.key,
          label: c.label,
          value: c.value,
          sourceText: c.sourceText,
        })),
      },
    },
    include: { criteria: true },
  });
}

export async function addTurn(
  sessionId: string,
  role: MessageRole,
  content: string,
  toolCalls?: unknown,
) {
  return prisma.conversationTurn.create({
    data: {
      sessionId,
      role,
      content,
      toolCalls: toolCalls as object | undefined,
    },
  });
}

export async function manageShortlist(input: {
  sessionId: string;
  action: "add" | "remove" | "list";
  productId?: string;
  note?: string;
}) {
  if (input.action === "list") {
    return prisma.shortlistItem.findMany({
      where: { sessionId: input.sessionId },
      include: { product: true },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!input.productId) {
    throw new Error("productId is required for add/remove");
  }
  if (input.action === "add") {
    return prisma.shortlistItem.upsert({
      where: {
        sessionId_productId: {
          sessionId: input.sessionId,
          productId: input.productId,
        },
      },
      create: {
        sessionId: input.sessionId,
        productId: input.productId,
        note: input.note,
      },
      update: { note: input.note },
      include: { product: true },
    });
  }
  await prisma.shortlistItem.deleteMany({
    where: { sessionId: input.sessionId, productId: input.productId },
  });
  return { removed: true, productId: input.productId };
}
