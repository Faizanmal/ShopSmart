import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  confirmCartAdd,
  getCart,
  proposeCartAdd,
} from "@/lib/cart/consent";

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("consent-controlled cart", () => {
  let sessionId: string;
  const productId = "ssd-crucial-mx500-1tb";

  beforeAll(async () => {
    const session = await prisma.shoppingSession.create({
      data: { title: "consent-test" },
    });
    sessionId = session.id;
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new Error("Seed products missing — run npm run db:seed");
    }
  });

  it("propose does not mutate cart", async () => {
    const before = await getCart(sessionId);
    const proposal = await proposeCartAdd({
      sessionId,
      productId,
      quantity: 1,
    });
    expect(proposal.ok).toBe(true);
    const after = await getCart(sessionId);
    expect(after.items.length).toBe(before.items.length);
  });

  it("valid confirmation adds once; replay fails", async () => {
    const other = await prisma.shoppingSession.create({
      data: { title: "consent-replay" },
    });
    const proposal = await proposeCartAdd({
      sessionId: other.id,
      productId,
      quantity: 1,
    });
    if (!proposal.ok) throw new Error(proposal.error);

    const first = await confirmCartAdd({
      sessionId: other.id,
      pendingActionId: proposal.pendingActionId,
      approved: true,
    });
    expect(first.ok).toBe(true);

    const cart = await getCart(other.id);
    expect(cart.items.some((i) => i.productId === productId)).toBe(true);

    const replay = await confirmCartAdd({
      sessionId: other.id,
      pendingActionId: proposal.pendingActionId,
      approved: true,
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe("already_consumed");
  });

  it("rejects confirmation for another session", async () => {
    const a = await prisma.shoppingSession.create({ data: { title: "iso-a" } });
    const b = await prisma.shoppingSession.create({ data: { title: "iso-b" } });
    const proposal = await proposeCartAdd({
      sessionId: a.id,
      productId,
      quantity: 1,
    });
    if (!proposal.ok) throw new Error(proposal.error);

    const stolen = await confirmCartAdd({
      sessionId: b.id,
      pendingActionId: proposal.pendingActionId,
      approved: true,
    });
    expect(stolen.ok).toBe(false);
    const cartB = await getCart(b.id);
    expect(cartB.items).toHaveLength(0);
  });

  it("ambiguous/denied approval does not add", async () => {
    const s = await prisma.shoppingSession.create({ data: { title: "deny" } });
    const proposal = await proposeCartAdd({
      sessionId: s.id,
      productId,
      quantity: 1,
    });
    if (!proposal.ok) throw new Error(proposal.error);
    const denied = await confirmCartAdd({
      sessionId: s.id,
      pendingActionId: proposal.pendingActionId,
      approved: false,
    });
    expect(denied.ok).toBe(false);
    const cart = await getCart(s.id);
    expect(cart.items).toHaveLength(0);
  });
});
