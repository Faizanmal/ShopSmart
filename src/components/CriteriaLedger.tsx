"use client";

import { Badge, Button, Panel } from "./ui";

type Criterion = {
  id?: string;
  kind: "HARD" | "SOFT" | "MISSING" | "UNVERIFIABLE";
  key: string;
  label: string;
  value: string;
};

const toneMap = {
  HARD: "ok",
  SOFT: "neutral",
  MISSING: "warn",
  UNVERIFIABLE: "danger",
} as const;

const kindHelp = {
  HARD: "Must be satisfied. Violations reject a candidate.",
  SOFT: "Influences ranking only after hard constraints pass.",
  MISSING: "Ask the user — do not invent a value.",
  UNVERIFIABLE: "Cannot be confirmed with current evidence.",
} as const;

export function CriteriaLedger({
  criteria,
  budgetMinInr,
  budgetMaxInr,
  onRemove,
  busy,
}: {
  criteria: Criterion[];
  budgetMinInr?: number | null;
  budgetMaxInr?: number | null;
  onRemove?: (criterionId: string) => void;
  busy?: boolean;
}) {
  const groups = {
    HARD: criteria.filter((c) => c.kind === "HARD"),
    SOFT: criteria.filter((c) => c.kind === "SOFT"),
    MISSING: criteria.filter((c) => c.kind === "MISSING"),
    UNVERIFIABLE: criteria.filter((c) => c.kind === "UNVERIFIABLE"),
  };

  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Criteria ledger
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Hard constraints are never silently relaxed. Missing facts stay missing.
          </p>
        </div>
        {(budgetMinInr != null || budgetMaxInr != null) && (
          <Badge tone="ok">
            Budget{" "}
            {budgetMinInr != null ? `₹${budgetMinInr}` : "—"}–
            {budgetMaxInr != null ? `₹${budgetMaxInr}` : "—"}
          </Badge>
        )}
      </div>
      <div className="grid gap-3">
        {(Object.keys(groups) as Array<keyof typeof groups>).map((kind) => (
          <div key={kind}>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge tone={toneMap[kind]}>{kind}</Badge>
              <span className="text-xs text-[var(--muted)]">{groups[kind].length}</span>
              <span className="text-xs text-[var(--muted)]">{kindHelp[kind]}</span>
            </div>
            {groups[kind].length === 0 ? (
              <p className="text-sm text-[var(--muted)]">None</p>
            ) : (
              <ul className="space-y-1">
                {groups[kind].map((c) => (
                  <li
                    key={c.id ?? `${c.kind}-${c.key}-${c.value}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-sm"
                  >
                    <span>
                      <span className="font-medium">{c.label}</span>
                      <span className="text-[var(--muted)]"> — {c.value}</span>
                    </span>
                    {onRemove && c.id && kind !== "UNVERIFIABLE" && (
                      <Button
                        variant="ghost"
                        className="shrink-0 px-2 py-1 text-xs"
                        disabled={busy}
                        onClick={() => onRemove(c.id!)}
                        aria-label={`Remove criterion ${c.label}`}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
