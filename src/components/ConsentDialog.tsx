"use client";

import { formatInr } from "@/lib/utils";
import { Button, Panel } from "./ui";

export type PendingProposal = {
  pendingActionId: string;
  expiresAt: string;
  actionType?: "CART_ADD" | "CART_UPDATE" | "CART_REMOVE";
  proposal: {
    productId: string;
    name?: string;
    variant: string | null;
    quantity: number;
    targetQuantity?: number;
    unitPriceInr: number;
    estimatedSubtotalInr?: number;
    retailer: string;
    sourceUrl: string;
    unknownCosts?: string[];
  };
};

const TITLES: Record<string, string> = {
  CART_ADD: "Confirm cart addition",
  CART_UPDATE: "Confirm quantity change",
  CART_REMOVE: "Confirm cart removal",
};

export function ConsentDialog({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PendingProposal;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const p = pending.proposal;
  const actionType = pending.actionType ?? "CART_ADD";
  const subtotal =
    p.estimatedSubtotalInr ??
    p.unitPriceInr * (p.targetQuantity ?? p.quantity);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
    >
      <Panel className="w-full max-w-lg animate-rise p-5">
        <h2 id="consent-title" className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          {TITLES[actionType]}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          ShopSmart will only change your planning cart after this explicit approval. This is not a purchase.
        </p>
        <dl className="mt-4 space-y-2 rounded-xl bg-black/[0.03] p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted)]">Product</dt>
            <dd className="text-right font-medium">{p.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted)]">Variant</dt>
            <dd>{p.variant || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted)]">Quantity</dt>
            <dd>
              {p.targetQuantity != null && p.targetQuantity !== p.quantity
                ? `${p.quantity} → ${p.targetQuantity}`
                : p.quantity}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted)]">Unit price (known)</dt>
            <dd>{formatInr(p.unitPriceInr)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted)]">Estimated subtotal</dt>
            <dd className="font-semibold">{formatInr(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted)]">Product ID</dt>
            <dd className="font-mono text-xs">{p.productId}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted)]">Retailer / source</dt>
            <dd className="text-right">
              {p.retailer}{" "}
              <a className="text-[var(--accent)] underline" href={p.sourceUrl} target="_blank" rel="noreferrer">
                link
              </a>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted)]">Expires</dt>
            <dd>{new Date(pending.expiresAt).toLocaleString("en-IN")}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-[var(--warn)]">
          Unknown costs: {(p.unknownCosts ?? ["delivery", "taxes_if_not_included"]).join(", ")}. Pending id: {pending.pendingActionId}
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={onConfirm}>
            {busy
              ? "Confirming…"
              : actionType === "CART_REMOVE"
                ? "Approve removal from ShopSmart cart"
                : actionType === "CART_UPDATE"
                  ? "Approve quantity change"
                  : "Approve add to ShopSmart cart"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
