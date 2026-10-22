export type CriterionKind = "HARD" | "SOFT" | "MISSING" | "UNVERIFIABLE";

export type ParsedCriterion = {
  kind: CriterionKind;
  key: string;
  label: string;
  value: string;
  sourceText?: string;
};

export type ParsedBrief = {
  rawText: string;
  categoryHint?: string;
  budgetMinInr?: number;
  budgetMaxInr?: number;
  criteria: ParsedCriterion[];
};
