import { NextResponse } from "next/server";
import { createSession, getSessionBundle } from "@/lib/session/service";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const created = await createSession(body.title);
  // Return the full bundle (with relations) so clients never see a
  // session object missing turns/shortlist/cartItems.
  const session = await getSessionBundle(created.id);
  return NextResponse.json({ session });
}

export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const bundle = await getSessionBundle(sessionId);
  if (!bundle) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ session: bundle });
}
