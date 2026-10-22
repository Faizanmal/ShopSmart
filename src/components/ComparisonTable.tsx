"use client";

import { formatInr } from "@/lib/utils";
import { Badge, Panel } from "./ui";

type Compared = {
  product: {
    id: string;
    name: string;
    priceInr: number;
    warranty?: string | null;
    retailer: string;
    dataProvider?: string;
    lastVerifiedAt?: string;
    missingFields?: string[];
    conflictingFields?: string[];
    specs?: Record<string, string | number | boolean | null>;
    availability?: string | null;
    deliveryInfo?: string | null;
  };
  verification: {
    overall: string;
    checks?: Array<{ label: string; status: string; evidence: string }>;
  };
  advantages: string[];
  disadvantages: string[];
  unknowns: string[];
  rankReason: string;
  score: number;
};

function spec(p: Compared["product"], key: string): string {
  const v = p.specs?.[key];
  if (v == null || String(v).toLowerCase() === "unknown") return "Unknown";
  return String(v);
}

export function ComparisonTable({ rows }: { rows: Compared[] }) {
  if (!rows.length) {
    return (
      <Panel className="p-4 text-sm text-[var(--muted)]">
        Select at least two products to compare, or run a shopping brief that returns candidates.
      </Panel>
    );
  }

  return (
    <Panel className="min-w-0 max-w-full overflow-x-auto p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Explainable comparison
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Hard constraints outrank soft preferences. Unknown costs are not treated as zero.
          </p>
        </div>
        <Badge tone="demo">Snapshot / labeled sources</Badge>
      </div>
      <table className="w-full min-w-[780px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <th className="py-2 pr-3">Factor</th>
            {rows.map((r) => (
              <th
                key={r.product.id}
                className="py-2 pr-3 font-semibold normal-case tracking-normal text-[var(--ink)]"
              >
                <div>{r.product.name}</div>
                <div className="mt-1 font-normal">
                  <Badge tone="demo">
                    {r.product.dataProvider === "LIVE" ? "Live" : "Snapshot"}
                  </Badge>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--line)]">
            <td className="py-2 pr-3 text-[var(--muted)]">Rank reason</td>
            {rows.map((r) => (
              <td key={r.product.id} className="py-2 pr-3">
                {r.rankReason}
              </td>
            ))}
          </tr>
          <tr className="border-b border-[var(--line)]">
            <td className="py-2 pr-3 text-[var(--muted)]">Known price</td>
            {rows.map((r) => (
              <td key={r.product.id} className="py-2 pr-3 font-semibold">
                {formatInr(r.product.priceInr)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-[var(--line)]">
            <td className="py-2 pr-3 text-[var(--muted)]">Form factor</td>
            {rows.map((r) => (
              <td key={r.product.id} className="py-2 pr-3">
                {spec(r.product, "formFactor")}
              </td>
            ))}
          </tr>
          <tr className="border-b border-[var(--line)]">
            <td className="py-2 pr-3 text-[var(--muted)]">Interface</td>
            {rows.map((r) => (
              <td key={r.product.id} className="py-2 pr-3">
                {spec(r.product, "interface")}
              </td>
            ))}
          </tr>
          <tr className="border-b border-[var(--line)]">
            <td className="py-2 pr-3 text-[var(--muted)]">Capacity</td>
            {rows.map((r) => (
              <td key={r.product.id} className="py-2 pr-3">
                {r.product.specs?.capacityGb != null
                  ? `${r.product.specs.capacityGb} GB`
                  : "Unknown"}
              </td>
            ))}
          </tr>
          <tr className="border-b border-[var(--line)]">
            <td className="py-2 pr-3 text-[var(--muted)]">Warranty</td>
            {rows.map((r) => (
              <td key={r.product.id} className="py-2 pr-3">
                {r.product.warranty?.trim() || "Unknown"}
              </td>
            ))}
          </tr>
          <tr className="border-b border-[var(--line)]">
            <td className="py-2 pr-3 text-[var(--muted)]">Hard requirements</td>
            {rows.map((r) => (
              <td key={r.product.id} className="py-2 pr-3">
                <Badge
                  tone={
                    r.verification.overall === "pass"
                      ? "ok"
                      : r.verification.overall === "fail"
                        ? "danger"
                        : "warn"
                  }
                >
                  {r.verification.overall}
                </Badge>
                {r.verification.checks && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-[var(--muted)]">
                    {r.verification.checks.slice(0, 4).map((c) => (
                      <li key={`${r.product.id}-${c.label}`}>
                        {c.label}: {c.status}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            ))}
          </tr>
          <tr className="border-b border-[var(--line)]">
            <td className="py-2 pr-3 text-[var(--muted)]">Advantages</td>
            {rows.map((r) => (
              <td key={r.product.id} className="py-2 pr-3">
                <ul className="list-disc pl-4">
                  {r.advantages.slice(0, 4).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </td>
            ))}
          </tr>
          <tr className="border-b border-[var(--line)]">
            <td className="py-2 pr-3 text-[var(--muted)]">Disadvantages</td>
            {rows.map((r) => (
              <td key={r.product.id} className="py-2 pr-3">
                <ul className="list-disc pl-4">
                  {r.disadvantages.slice(0, 4).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                  {r.disadvantages.length === 0 && <li>None recorded</li>}
                </ul>
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 pr-3 text-[var(--muted)]">Unknown / missing</td>
            {rows.map((r) => (
              <td key={r.product.id} className="py-2 pr-3">
                {(r.unknowns.length ? r.unknowns : r.product.missingFields ?? [])
                  .slice(0, 5)
                  .join("; ") || "—"}
                {r.product.deliveryInfo && /unknown/i.test(r.product.deliveryInfo)
                  ? "; delivery unknown"
                  : ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Subtotals use known unit prices only. Delivery and tax are unknown unless a source provides
        them. Snapshot listings are not live retailer inventory — verify on the retailer page.
      </p>
    </Panel>
  );
}
