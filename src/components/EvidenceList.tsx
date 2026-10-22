"use client";

import type { EvidenceClaim } from "@/lib/catalog/types";
import type { ClaimRow } from "@/lib/catalog/claims";
import { Badge } from "./ui";

function toneFor(
  status: ClaimRow["status"] | EvidenceClaim["status"],
): "ok" | "warn" | "danger" | "neutral" | "demo" {
  switch (status) {
    case "verified":
      return "ok";
    case "provider_claim":
      return "demo";
    case "estimate":
    case "inferred":
      return "warn";
    case "unknown":
    case "missing":
      return "danger";
    default:
      return "neutral";
  }
}

export function EvidenceList({
  claims,
  compact,
}: {
  claims: ClaimRow[];
  compact?: boolean;
}) {
  return (
    <ul className={compact ? "space-y-1" : "space-y-1.5"} aria-label="Product evidence">
      {claims.map((c) => (
        <li
          key={c.key}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
        >
          <Badge tone={toneFor(c.status)}>{c.status}</Badge>
          <span className="font-medium">{c.label}:</span>
          <span className={c.status === "missing" || c.status === "unknown" ? "text-[var(--warn)]" : ""}>
            {c.value}
          </span>
          {c.source && !compact && (
            <span className="w-full text-[11px] text-[var(--muted)]">Source: {c.source}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
