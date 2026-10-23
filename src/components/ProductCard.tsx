"use client";

import { useState } from "react";
import Image from "next/image";
import { Badge, Button, Panel } from "./ui";
import { EvidenceList } from "./EvidenceList";
import { formatInr } from "@/lib/utils";
import type { ClaimRow } from "@/lib/catalog/claims";
import type { EvidenceClaim } from "@/lib/catalog/types";

export type UiProduct = {
  id: string;
  name: string;
  brand: string;
  variant?: string | null;
  priceInr: number;
  imageUrl?: string | null;
  retailer: string;
  sourceUrl: string;
  dataProvider?: "DEMO" | "LIVE";
  lastVerifiedAt?: string;
  missingFields?: string[];
  conflictingFields?: string[];
  specs?: Record<string, string | number | boolean | null>;
  warranty?: string | null;
  availability?: string | null;
  deliveryInfo?: string | null;
  evidence?: EvidenceClaim[];
  claimRows?: ClaimRow[];
};

export function ProductCard({
  product,
  verification,
  onShortlist,
  onPropose,
  onCompareToggle,
  onInspect,
  selected,
  shortlisted,
}: {
  product: UiProduct;
  verification?: { overall: string; hardViolations?: Array<{ label: string; evidence?: string }> };
  onShortlist?: () => void;
  onPropose?: () => void;
  onCompareToggle?: () => void;
  onInspect?: () => void;
  selected?: boolean;
  shortlisted?: boolean;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const tone =
    verification?.overall === "pass"
      ? "ok"
      : verification?.overall === "fail"
        ? "danger"
        : verification?.overall === "uncertain"
          ? "warn"
          : "neutral";

  const claimRows =
    product.claimRows ??
    (product.evidence ?? []).map((e, i) => ({
      key: `ev-${i}`,
      label: "Claim",
      value: e.claim,
      status: e.status,
      source: e.source,
    }));

  return (
    <Panel className="animate-rise flex flex-col overflow-hidden">
      <div className="relative aspect-[16/10] bg-[#e8efe9]">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width:768px) 100vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
            No image provided by source
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <Badge tone="demo">
            {product.dataProvider === "LIVE" ? "Live data" : "Snapshot data"}
          </Badge>
          {verification && <Badge tone={tone}>{verification.overall}</Badge>}
          {shortlisted && <Badge tone="ok">Shortlisted</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {product.brand}
            {product.variant ? ` · ${product.variant}` : ""}
          </p>
          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug">{product.name}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--muted)]">{product.id}</p>
        </div>
        <p className="text-lg font-semibold text-[var(--accent)]">{formatInr(product.priceInr)}</p>
        <p className="text-xs text-[var(--muted)]">
          {product.retailer}
          {product.lastVerifiedAt
            ? ` · verified ${new Date(product.lastVerifiedAt).toLocaleDateString("en-IN")}`
            : " · verification time unknown"}
        </p>
        {product.specs && (
          <p className="text-xs text-[var(--muted)]">
            {[
              product.specs.formFactor && String(product.specs.formFactor) !== "unknown"
                ? String(product.specs.formFactor)
                : "form factor unknown",
              product.specs.interface && String(product.specs.interface) !== "unknown"
                ? String(product.specs.interface)
                : "interface unknown",
              product.specs.capacityGb ? `${product.specs.capacityGb} GB` : "capacity unknown",
            ].join(" · ")}
          </p>
        )}
        <p className="text-xs text-[var(--muted)]">
          Warranty: {product.warranty?.trim() || "Unknown"}
          {" · "}
          Availability: {product.availability && !/unknown/i.test(product.availability)
            ? product.availability
            : "Unknown"}
        </p>
        {verification?.hardViolations && verification.hardViolations.length > 0 && (
          <p className="text-xs text-[var(--danger)]">
            Hard violations:{" "}
            {verification.hardViolations.map((v) => v.label).join(", ")}
          </p>
        )}
        {(product.conflictingFields?.length ?? 0) > 0 && (
          <p className="text-xs text-[var(--danger)]">
            Conflicting fields: {product.conflictingFields?.join(", ")}
          </p>
        )}
        {(product.missingFields?.length ?? 0) > 0 && (
          <p className="text-xs text-[var(--warn)]">
            Missing / unknown: {product.missingFields?.slice(0, 4).join(", ")}
            {(product.missingFields?.length ?? 0) > 4 ? "…" : ""}
          </p>
        )}

        <div className="mt-1">
          <Button
            variant="ghost"
            className="h-auto px-0 py-0 text-xs"
            onClick={() => setShowEvidence((v) => !v)}
            aria-expanded={showEvidence}
          >
            {showEvidence ? "Hide evidence" : "Show evidence"}
          </Button>
          {showEvidence && (
            <div className="mt-2 rounded-lg bg-black/[0.03] p-2">
              {claimRows.length > 0 ? (
                <EvidenceList claims={claimRows} compact />
              ) : (
                <p className="text-xs text-[var(--warn)]">No evidence rows — treat claims as unknown.</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" onClick={onCompareToggle} aria-pressed={selected}>
            {selected ? "In compare" : "Compare"}
          </Button>
          <Button variant="secondary" onClick={onShortlist}>
            {shortlisted ? "Shortlisted" : "Shortlist"}
          </Button>
          {onInspect && (
            <Button variant="secondary" onClick={onInspect}>
              Details
            </Button>
          )}
          <Button
            onClick={onPropose}
            disabled={verification?.overall === "fail"}
            title={
              verification?.overall === "fail"
                ? "Fails a hard constraint — cannot be added to the cart"
                : undefined
            }
          >
            {verification?.overall === "fail" ? "Fails constraints" : "Propose cart"}
          </Button>
          <a
            href={product.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="self-center text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Source
          </a>
        </div>
      </div>
    </Panel>
  );
}
