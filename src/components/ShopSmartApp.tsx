"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CriteriaLedger } from "./CriteriaLedger";
import { ComparisonTable } from "./ComparisonTable";
import { ConsentDialog, type PendingProposal } from "./ConsentDialog";
import { ProductCard, type UiProduct } from "./ProductCard";
import { ShortlistPanel } from "./ShortlistPanel";
import { Badge, Button, Panel, TextArea } from "./ui";
import { formatInr } from "@/lib/utils";

type Verification = {
  overall: string;
  hardViolations?: Array<{ label: string; evidence?: string }>;
  checks?: Array<{ label: string; status: string; evidence: string }>;
};

type SessionBundle = {
  id: string;
  turns: Array<{ id: string; role: string; content: string }>;
  brief?: {
    budgetMinInr?: number | null;
    budgetMaxInr?: number | null;
    criteria: Array<{
      id: string;
      kind: "HARD" | "SOFT" | "MISSING" | "UNVERIFIABLE";
      key: string;
      label: string;
      value: string;
    }>;
  } | null;
  shortlist: Array<{ product: UiProduct }>;
  cartItems: Array<{
    id: string;
    quantity: number;
    unitPriceInr: number;
    product: UiProduct;
    retailer: string;
    sourceUrl: string;
  }>;
  pendingActions: Array<{
    id: string;
    productId: string;
    variant: string | null;
    quantity: number;
    unitPriceInr: number;
    retailer: string;
    sourceUrl: string;
    expiresAt: string;
  }>;
};

const DEMO_PROMPT =
  "I need a reliable 1 TB internal SSD for a laptop that supports a 2.5-inch SATA drive. My budget is up to ₹30,000. Compare options from approved Indian retailers, prioritize reliable products and warranty, and flag compatibility or seller details you cannot verify.";

export function ShopSmartApp() {
  const [session, setSession] = useState<SessionBundle | null>(null);
  const [message, setMessage] = useState(DEMO_PROMPT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<UiProduct[]>([]);
  const [verifications, setVerifications] = useState<Record<string, Verification>>({});
  const [comparison, setComparison] = useState<unknown[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingProposal | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<{
    ok: boolean;
    tools?: Array<{ name: string }>;
    error?: string;
  } | null>(null);
  const [toolTrace, setToolTrace] = useState<
    Array<{ tool: string; ok: boolean; error?: string; viaMcp?: boolean }>
  >([]);
  const [orchestration, setOrchestration] = useState<"deterministic" | "llm" | null>(
    null,
  );
  const [listening, setListening] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const refreshSession = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/sessions?sessionId=${sessionId}`);
    const data = await res.json();
    if (data.session) setSession(data.session);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = localStorage.getItem("shopsmart.sessionId");
        if (existing) {
          const res = await fetch(`/api/sessions?sessionId=${existing}`);
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) setSession(data.session);
            return;
          }
        }
        const created = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "India SSD upgrade" }),
        }).then((r) => r.json());
        localStorage.setItem("shopsmart.sessionId", created.session.id);
        if (!cancelled) setSession(created.session);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetch("/api/mcp/status")
      .then((r) => r.json())
      .then(setMcpStatus)
      .catch((e) => setMcpStatus({ ok: false, error: String(e) }));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.turns?.length]);

  const shortlistIds = useMemo(
    () => new Set((session?.shortlist ?? []).map((s) => s.product.id)),
    [session?.shortlist],
  );

  const cartCount = session?.cartItems.length ?? 0;
  const knownCartTotal = useMemo(
    () =>
      (session?.cartItems ?? []).reduce(
        (sum, i) => sum + i.unitPriceInr * i.quantity,
        0,
      ),
    [session?.cartItems],
  );

  async function sendMessage(text: string) {
    if (!session || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, message: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      if (data.session) setSession(data.session);
      if (Array.isArray(data.products)) setProducts(data.products);
      if (data.verifications && typeof data.verifications === "object") {
        setVerifications(data.verifications as Record<string, Verification>);
      }
      if (Array.isArray(data.comparison)) setComparison(data.comparison);
      if (typeof data.dataProviderNotice === "string") {
        setCatalogNotice(data.dataProviderNotice);
      }
      if (
        data.pendingProposal &&
        data.pendingProposal.ok !== false &&
        data.pendingProposal.pendingActionId
      ) {
        setPending(data.pendingProposal as PendingProposal);
      }
      if (Array.isArray(data.toolTrace)) setToolTrace(data.toolTrace);
      if (data.orchestration) setOrchestration(data.orchestration);
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function proposeProduct(productId: string) {
    await sendMessage(`propose cart add ${productId}`);
  }

  async function shortlistProduct(productId: string) {
    if (!session) return;
    setBusy(true);
    try {
      await fetch("/api/mcp/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "manage_shortlist",
          args: { sessionId: session.id, action: "add", productId },
        }),
      });
      await refreshSession(session.id);
    } finally {
      setBusy(false);
    }
  }

  async function removeShortlist(productId: string) {
    if (!session) return;
    setBusy(true);
    try {
      await fetch("/api/mcp/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "manage_shortlist",
          args: { sessionId: session.id, action: "remove", productId },
        }),
      });
      await refreshSession(session.id);
    } finally {
      setBusy(false);
    }
  }

  async function removeCriterion(criterionId: string) {
    if (!session) return;
    setBusy(true);
    try {
      const res = await fetch("/api/brief/criterion", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, criterionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove criterion");
      await refreshSession(session.id);
      // Re-evaluate visible products against updated criteria
      if (products.length) {
        const evalRes = await fetch("/api/research/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            productIds: products.map((p) => p.id),
            compare: products.length >= 2,
          }),
        });
        const evalData = await evalRes.json();
        if (evalRes.ok) {
          if (evalData.products) setProducts(evalData.products);
          if (evalData.verifications) setVerifications(evalData.verifications);
          if (evalData.comparison) setComparison(evalData.comparison);
          if (evalData.notice) setCatalogNotice(evalData.notice);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function proposeCartChange(
    tool: "propose_cart_update" | "propose_cart_remove",
    cartItemId: string,
    quantity?: number,
  ) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tool,
          args: { sessionId: session.id, cartItemId, ...(quantity != null ? { quantity } : {}) },
        }),
      });
      const data = await res.json();
      const result = data.result as PendingProposal & { ok?: boolean; error?: string };
      if (!res.ok || result?.ok === false || !result?.pendingActionId) {
        throw new Error(result?.error || "Could not create a pending cart change");
      }
      setPending(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPending(approved: boolean) {
    if (!session || !pending) return;
    setBusy(true);
    try {
      const res = await fetch("/api/cart/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          pendingActionId: pending.pendingActionId,
          approved,
        }),
      });
      const data = await res.json();
      setPending(null);
      await refreshSession(session.id);
      if (!data.confirm?.ok || data.confirm?.result?.ok === false) {
        setError(
          data.confirm?.result?.error ||
            data.confirm?.error ||
            "Confirmation did not modify the cart",
        );
      } else if (approved) {
        setCartOpen(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-4),
    );
  }

  async function runCompareSelected() {
    if (!session || compareIds.length < 2) return;
    setBusy(true);
    try {
      const evalRes = await fetch("/api/research/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          productIds: compareIds,
          compare: true,
        }),
      });
      const evalData = await evalRes.json();
      if (!evalRes.ok) throw new Error(evalData.error || "Compare failed");
      if (evalData.comparison) setComparison(evalData.comparison);
      if (evalData.verifications) {
        setVerifications((prev) => ({ ...prev, ...evalData.verifications }));
      }
      if (evalData.notice) setCatalogNotice(evalData.notice);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    const SR =
      typeof window !== "undefined"
        ? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition })
            .webkitSpeechRecognition ||
          (window as unknown as { SpeechRecognition?: new () => SpeechRecognition })
            .SpeechRecognition
        : undefined;
    if (!SR) {
      setError("Speech recognition is not supported in this browser. Use text input.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript;
      if (text) setMessage(text);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text.slice(0, 400));
    u.lang = "en-IN";
    window.speechSynthesis.speak(u);
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <header className="animate-rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            ShopSmart
          </p>
          <h1 className="mt-1 max-w-xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight sm:text-5xl">
            Compare with evidence. Cart with consent.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
            Constraint-first shopping for India (INR). Catalog results are a dated snapshot of
            real products and retailer links — not live pricing. Claims without evidence stay
            unknown — ShopSmart never purchases on your behalf. Buy via the retailer link.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={mcpStatus == null ? "neutral" : mcpStatus.ok ? "ok" : "danger"}
          >
            MCP{" "}
            {mcpStatus == null
              ? "checking…"
              : mcpStatus.ok
                ? "connected"
                : "offline"}
          </Badge>
          <Badge tone={products.some((p) => p.dataProvider === "LIVE") ? "ok" : "demo"}>
            {products.some((p) => p.dataProvider === "LIVE")
              ? "Live data · Amazon.in"
              : "Catalog snapshot · 21 Oct 2026"}
          </Badge>
          <Button variant="secondary" onClick={() => setCartOpen(true)}>
            Cart ({cartCount}) · {formatInr(knownCartTotal)}
          </Button>
        </div>
      </header>

      {error && (
        <Panel className="mb-4 border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </Panel>
      )}
      {catalogNotice && (
        <Panel className="mb-4 border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950">
          {catalogNotice}
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="flex h-[420px] flex-col overflow-hidden">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                Assistant workspace
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Natural-language brief updates the criteria ledger, then runs catalog research.
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {(session?.turns ?? []).length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  Describe what you need. Try the prefilled 1TB SATA SSD brief for the demo.
                </p>
              )}
              {(session?.turns ?? []).map((t) => (
                <div
                  key={t.id}
                  className={`max-w-[95%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                    t.role === "USER"
                      ? "ml-auto bg-[var(--accent)] text-white"
                      : "bg-black/[0.04]"
                  }`}
                >
                  {t.content}
                </div>
              ))}
              {busy && (
                <p className="animate-pulse-soft text-sm text-[var(--muted)]">
                  Researching via tools…
                </p>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-[var(--line)] p-3">
              <TextArea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your shopping need…"
                aria-label="Shopping message"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button disabled={busy || !session} onClick={() => sendMessage(message)}>
                  Send
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setMessage(DEMO_PROMPT)}
                >
                  Load demo brief
                </Button>
                <Button variant="ghost" onClick={startVoice} aria-pressed={listening}>
                  {listening ? "Listening…" : "Voice input"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    speak(
                      session?.turns.filter((t) => t.role === "ASSISTANT").at(-1)?.content ??
                        "",
                    )
                  }
                >
                  Speak reply
                </Button>
              </div>
            </div>
          </Panel>

          {session?.brief ? (
            <CriteriaLedger
              criteria={session.brief.criteria}
              budgetMinInr={session.brief.budgetMinInr}
              budgetMaxInr={session.brief.budgetMaxInr}
              onRemove={removeCriterion}
              busy={busy}
            />
          ) : (
            <Panel className="p-4 text-sm text-[var(--muted)]">
              Criteria ledger appears after you submit a shopping brief.
            </Panel>
          )}

          <Panel className="p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                MCP tool activity
              </h2>
              <div className="flex flex-wrap gap-1 text-xs text-[var(--muted)]">
                <Badge tone="neutral">{mcpStatus?.tools?.length ?? 0} tools</Badge>
                {orchestration && (
                  <Badge tone={orchestration === "llm" ? "ok" : "demo"}>
                    {orchestration}
                  </Badge>
                )}
              </div>
            </div>
            <p className="mb-2 text-xs text-[var(--muted)]">
              Each row is a real Streamable HTTP <code>tools/call</code>. Catalog data may still be
              snapshot-labeled.
            </p>
            {toolTrace.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No tool calls yet this turn.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {toolTrace.map((t, i) => (
                  <li key={`${t.tool}-${i}`} className="flex flex-wrap items-center gap-2">
                    <Badge tone={t.ok ? "ok" : "danger"}>{t.ok ? "ok" : "err"}</Badge>
                    {t.viaMcp !== false && <Badge tone="ok">MCP</Badge>}
                    <code>{t.tool}</code>
                    {t.error && <span className="text-[var(--danger)]">{t.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                Research results
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Pass / fail / uncertain reflects hard constraints. Expand evidence on each card.
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={compareIds.length < 2 || busy}
              onClick={runCompareSelected}
            >
              Compare selected ({compareIds.length})
            </Button>
          </div>
          {products.length === 0 ? (
            <Panel className="p-6 text-sm text-[var(--muted)]">
              Product cards appear after a search. Images are stock photos for UI realism — not
              retailer-provided assets. Snapshot listings are always labeled with their capture date.
            </Panel>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  verification={verifications[p.id]}
                  selected={compareIds.includes(p.id)}
                  shortlisted={shortlistIds.has(p.id)}
                  onCompareToggle={() => toggleCompare(p.id)}
                  onShortlist={() => shortlistProduct(p.id)}
                  onPropose={() => proposeProduct(p.id)}
                />
              ))}
            </div>
          )}

          <ComparisonTable rows={(comparison as never[]) ?? []} />

          <ShortlistPanel
            items={session?.shortlist ?? []}
            compareIds={compareIds}
            onCompareToggle={toggleCompare}
            onRemove={removeShortlist}
            onPropose={proposeProduct}
            busy={busy}
          />
        </div>
      </div>

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" role="dialog" aria-modal>
          <Panel className="h-full w-full max-w-md animate-rise rounded-none border-y-0 border-r-0 p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
                  Planning cart
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  ShopSmart cart only — buy by opening the retailer link yourself.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setCartOpen(false)}>
                Close
              </Button>
            </div>
            {(session?.cartItems.length ?? 0) === 0 ? (
              <p className="text-sm text-[var(--muted)]">Cart is empty.</p>
            ) : (
              <ul className="space-y-3">
                {session?.cartItems.map((item) => (
                  <li key={item.id} className="rounded-xl bg-black/[0.03] p-3 text-sm">
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-[var(--muted)]">
                      Qty {item.quantity} · {formatInr(item.unitPriceInr)} each
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Button
                        variant="secondary"
                        disabled={busy || item.quantity <= 1}
                        aria-label={`Decrease quantity of ${item.product.name}`}
                        onClick={() => proposeCartChange("propose_cart_update", item.id, item.quantity - 1)}
                      >
                        −
                      </Button>
                      <span className="px-1 text-sm" aria-label="Quantity">{item.quantity}</span>
                      <Button
                        variant="secondary"
                        disabled={busy || item.quantity >= 20}
                        aria-label={`Increase quantity of ${item.product.name}`}
                        onClick={() => proposeCartChange("propose_cart_update", item.id, item.quantity + 1)}
                      >
                        +
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => proposeCartChange("propose_cart_remove", item.id)}
                      >
                        Remove
                      </Button>
                      <span className="ml-auto text-xs text-[var(--muted)]">
                        changes need your confirmation
                      </span>
                    </div>
                    <Badge tone="demo">
                      {item.product.dataProvider === "LIVE" ? "Live" : "Snapshot"}
                    </Badge>
                    <a
                      className="mt-1 block text-[var(--accent)] underline-offset-2 hover:underline"
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open retailer link
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t border-[var(--line)] pt-3 text-sm">
              <p className="font-semibold">Known subtotal: {formatInr(knownCartTotal)}</p>
              {session?.brief?.budgetMaxInr != null && knownCartTotal > session.brief.budgetMaxInr && (
                <p className="mt-1 font-medium text-[var(--danger)]">
                  Over your brief budget of {formatInr(session.brief.budgetMaxInr)} by{" "}
                  {formatInr(knownCartTotal - session.brief.budgetMaxInr)} (known prices only).
                </p>
              )}
              <p className="mt-1 text-[var(--warn)]">
                Delivery and tax may be unknown — not included as a final amount.
              </p>
            </div>
          </Panel>
        </div>
      )}

      {pending?.pendingActionId && (
        <ConsentDialog
          pending={pending}
          busy={busy}
          onConfirm={() => confirmPending(true)}
          onCancel={() => confirmPending(false)}
        />
      )}
    </div>
  );
}

type SpeechRecognition = {
  lang: string;
  start: () => void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
