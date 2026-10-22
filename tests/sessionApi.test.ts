import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/sessions/route";

const hasDb = Boolean(process.env.DATABASE_URL);

// Regression: a freshly created session must include relations
// (turns/shortlist/cartItems arrays). Returning the bare Prisma create
// result crashed the client on first visit (session.turns undefined).
describe.runIf(hasDb)("POST /api/sessions returns a full session bundle", () => {
  it("includes empty turns, shortlist and cartItems arrays", async () => {
    const req = new Request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "session-api-regression" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: Record<string, unknown> };
    expect(typeof body.session.id).toBe("string");
    expect(Array.isArray(body.session.turns)).toBe(true);
    expect(Array.isArray(body.session.shortlist)).toBe(true);
    expect(Array.isArray(body.session.cartItems)).toBe(true);
  });
});
