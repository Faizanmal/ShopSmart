"use client";

import { formatInr } from "@/lib/utils";
import { Badge, Button, Panel } from "./ui";
import type { UiProduct } from "./ProductCard";

export function ShortlistPanel({
  items,
  compareIds,
  onCompareToggle,
  onRemove,
  onPropose,
  busy,
}: {
  items: Array<{ product: UiProduct }>;
  compareIds: string[];
  onCompareToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onPropose: (id: string) => void;
  busy?: boolean;
}) {
  return (
    <Panel className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Shortlist
        </h2>
        <Badge tone="neutral">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Shortlist products to keep them across turns for comparison.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map(({ product }) => (
            <li
              key={product.id}
              className="rounded-xl bg-black/[0.03] p-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatInr(product.priceInr)} ·{" "}
                    <Badge tone="demo">
                      {product.dataProvider === "LIVE" ? "Live" : "Snapshot"}
                    </Badge>
                  </p>
                  {(product.missingFields?.length ?? 0) > 0 && (
                    <p className="mt-1 text-xs text-[var(--warn)]">
                      Unknown: {product.missingFields?.slice(0, 3).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onCompareToggle(product.id)}
                  >
                    {compareIds.includes(product.id) ? "Compared" : "Compare"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onPropose(product.id)}
                  >
                    Propose
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onRemove(product.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
