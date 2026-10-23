import type { ParsedBrief, ParsedCriterion } from "./types";

function push(
  criteria: ParsedCriterion[],
  kind: ParsedCriterion["kind"],
  key: string,
  label: string,
  value: string,
  sourceText?: string,
) {
  criteria.push({ kind, key, label, value, sourceText });
}

const CUR = "(?:₹|rs\\.?|inr|rupees?)?";

function parseBudget(text: string): { min?: number; max?: number } {
  const range = text.match(
    new RegExp(`${CUR}\\s*([\\d,]+)\\s*(?:[-–]|\\bto\\b)\\s*${CUR}\\s*([\\d,]+)`, "i"),
  );
  if (range) {
    return {
      min: Number(range[1].replace(/,/g, "")),
      max: Number(range[2].replace(/,/g, "")),
    };
  }
  const under = text.match(
    new RegExp(`(?:under|below|max(?:imum)?|upto|up to)\\s*${CUR}\\s*([\\d,]+)`, "i"),
  );
  if (under) {
    return { max: Number(under[1].replace(/,/g, "")) };
  }
  const around = text.match(
    new RegExp(`(?:around|about|budget(?: of)?)\\s*${CUR}\\s*([\\d,]+)`, "i"),
  );
  if (around) {
    const n = Number(around[1].replace(/,/g, ""));
    return { min: Math.round(n * 0.85), max: Math.round(n * 1.15) };
  }
  return {};
}

/**
 * Deterministic shopping-brief parser (no LLM required).
 * Tuned for the hackathon SSD / India retail demo language.
 */
export function parseShoppingBrief(rawText: string): ParsedBrief {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const criteria: ParsedCriterion[] = [];

  const budget = parseBudget(text);
  if (budget.min != null || budget.max != null) {
    if (budget.min != null) {
      push(criteria, "HARD", "budget_min", "Minimum budget", `₹${budget.min}`, text);
    }
    if (budget.max != null) {
      push(criteria, "HARD", "budget_max", "Maximum budget", `₹${budget.max}`, text);
    }
  } else {
    push(criteria, "MISSING", "budget", "Budget range", "not specified");
  }

  let categoryHint: string | undefined;
  if (/\bssd\b|solid state/i.test(text)) {
    categoryHint = "internal-ssd";
    push(criteria, "HARD", "media_type", "Storage media", "SSD", "ssd");
  } else if (/\bhdd\b|hard disk/i.test(text)) {
    categoryHint = "internal-hdd";
    push(criteria, "HARD", "media_type", "Storage media", "HDD", "hdd");
  } else {
    push(criteria, "MISSING", "category", "Product category", "not specified");
  }

  const capacity = lower.match(/(\d+(?:\.\d+)?)\s*(tb|gb)/i);
  if (capacity) {
    const amount = Number(capacity[1]);
    const unit = capacity[2].toLowerCase();
    const gb = unit === "tb" ? amount * 1000 : amount;
    push(criteria, "HARD", "capacity_gb", "Minimum capacity", `${gb} GB`, capacity[0]);
  } else if (categoryHint) {
    push(criteria, "MISSING", "capacity_gb", "Capacity", "not specified");
  }

  if (/2\.5[\s-]*inch|2\.5"|2\.5’/i.test(text)) {
    push(criteria, "HARD", "form_factor", "Form factor", "2.5-inch", "2.5-inch");
  }
  if (/\bsata\b/i.test(text)) {
    push(criteria, "HARD", "interface", "Interface", "SATA", "SATA");
  }
  if (/\bnvme\b|m\.2\b/i.test(text)) {
    push(criteria, "HARD", "interface", "Interface", "NVMe", "NVMe/M.2");
    push(criteria, "HARD", "form_factor", "Form factor", "M.2", "M.2");
  }

  if (/laptop/i.test(text) && /2\.5/.test(text) && /sata/i.test(text)) {
    push(
      criteria,
      "HARD",
      "compatibility",
      "Laptop bay compatibility",
      "2.5-inch SATA",
      "laptop that supports a 2.5-inch SATA drive",
    );
  }

  if (/reliable|reliability|warranty/i.test(text)) {
    push(criteria, "SOFT", "prefer_warranty", "Prefer longer warranty", "yes", "warranty/reliable");
  }
  if (/indian retailer|india|amazon\.in|flipkart/i.test(text)) {
    push(criteria, "SOFT", "retailer_region", "Prefer Indian retailers", "India", "Indian retailers");
  }
  if (/flag compatibility|cannot verify|missing/i.test(text)) {
    push(
      criteria,
      "SOFT",
      "surface_uncertainty",
      "Surface unverifiable details",
      "yes",
      "flag compatibility or seller details you cannot verify",
    );
  }

  const excludeBrand = lower.match(/\bexclude\s+([a-z0-9]+)|\bnot\s+([a-z0-9]+)|\bno\s+([a-z0-9]+)/i);
  if (excludeBrand) {
    const brand = excludeBrand[1] || excludeBrand[2] || excludeBrand[3];
    if (
      brand &&
      !["ssd", "hdd", "sata", "nvme", "verify", "verified", "sure", "specified", "provided"].includes(brand)
    ) {
      push(criteria, "HARD", "exclude_brand", "Exclude brand", brand, excludeBrand[0]);
    }
  }

  // Always note delivery/tax as unverifiable in demo mode unless user accepts unknowns.
  push(
    criteria,
    "UNVERIFIABLE",
    "delivery_cost",
    "Delivery charges",
    "not supplied by catalog or listing data",
  );
  push(
    criteria,
    "UNVERIFIABLE",
    "tax_breakdown",
    "Tax breakdown",
    "not itemized in catalog or listing data",
  );

  return {
    rawText: text,
    categoryHint,
    budgetMinInr: budget.min,
    budgetMaxInr: budget.max,
    criteria,
  };
}

export function criteriaNeedsFollowUp(brief: ParsedBrief): string[] {
  return brief.criteria.filter((c) => c.kind === "MISSING").map((c) => c.label);
}

/** True when a follow-up message refines an existing brief rather than starting a new one. */
export function isRefinementMessage(text: string): boolean {
  return /\b(exclude|remove|drop|change|update|instead|actually|also|raise|lower|increase|decrease|make it|no longer|without)\b/i.test(
    text,
  );
}

/**
 * Merge a newly parsed (partial) brief into the existing brief.
 *
 * Refinement semantics (never silently relax a hard constraint):
 * - Incoming HARD/SOFT criteria replace existing criteria with the same key.
 * - Existing criteria the follow-up does not mention are KEPT.
 * - Budget is replaced as a unit: a new budget bound drops old budget bounds
 *   the follow-up did not restate (so "under ₹6,000" clears a stale ₹7,000 min).
 * - Incoming MISSING entries never erase a resolved existing criterion.
 * - UNVERIFIABLE entries are refreshed from the incoming parse.
 */
export function mergeParsedBrief(existing: ParsedBrief, incoming: ParsedBrief): ParsedBrief {
  const incomingHasBudget = incoming.criteria.some(
    (c) => c.key === "budget_min" || c.key === "budget_max",
  );
  const resolvedKeys = new Set(
    existing.criteria.filter((c) => c.kind !== "MISSING").map((c) => c.key),
  );
  // A resolved budget/category also satisfies the corresponding MISSING key.
  if (resolvedKeys.has("budget_min") || resolvedKeys.has("budget_max")) resolvedKeys.add("budget");
  if (resolvedKeys.has("media_type")) resolvedKeys.add("category");

  const merged = new Map<string, ParsedCriterion>();
  for (const c of existing.criteria) {
    if (c.kind === "UNVERIFIABLE") continue; // refreshed below
    if (incomingHasBudget && (c.key === "budget_min" || c.key === "budget_max")) continue;
    merged.set(c.key, c);
  }
  for (const c of incoming.criteria) {
    if (c.kind === "UNVERIFIABLE") continue;
    if (c.kind === "MISSING" && resolvedKeys.has(c.key)) continue;
    if (c.kind === "MISSING" && merged.has(c.key)) continue;
    merged.set(c.key, c);
  }
  // Drop MISSING entries that the merge has now resolved.
  for (const [key, c] of merged) {
    if (c.kind !== "MISSING") continue;
    if (key === "budget" && (merged.has("budget_min") || merged.has("budget_max"))) merged.delete(key);
    if (key === "category" && merged.has("media_type")) merged.delete(key);
    if (key === "capacity_gb" && merged.get("capacity_gb")?.kind === "MISSING" && resolvedKeys.has("capacity_gb")) merged.delete(key);
  }
  const unverifiable = incoming.criteria.filter((c) => c.kind === "UNVERIFIABLE");

  return {
    rawText: `${existing.rawText}\n[refinement] ${incoming.rawText}`,
    categoryHint: incoming.categoryHint ?? existing.categoryHint,
    budgetMinInr: incomingHasBudget ? incoming.budgetMinInr : existing.budgetMinInr,
    budgetMaxInr: incomingHasBudget ? incoming.budgetMaxInr : existing.budgetMaxInr,
    criteria: [...merged.values(), ...unverifiable],
  };
}
