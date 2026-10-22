import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const schema = z.object({
  sessionId: z.string(),
  criterionId: z.string(),
});

/** Remove a user-editable criterion (hard/soft/missing). Does not invent replacements. */
export async function DELETE(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const criterion = await prisma.criterion.findUnique({
      where: { id: body.criterionId },
      include: { brief: true },
    });
    if (!criterion || criterion.brief.sessionId !== body.sessionId) {
      return NextResponse.json({ error: "Criterion not found for session" }, { status: 404 });
    }
    if (criterion.kind === "UNVERIFIABLE") {
      return NextResponse.json(
        { error: "Unverifiable constraints reflect evidence limits and cannot be removed this way." },
        { status: 400 },
      );
    }
    await prisma.criterion.delete({ where: { id: criterion.id } });
    const brief = await prisma.shoppingBrief.findUnique({
      where: { sessionId: body.sessionId },
      include: { criteria: true },
    });
    return NextResponse.json({ ok: true, brief });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
