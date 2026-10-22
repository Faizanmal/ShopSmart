import type { ParsedCriterion } from "@/lib/criteria/types";
import type { ProductRecord } from "@/lib/catalog/types";
import { verifyProductRequirements, type VerificationResult } from "@/lib/verify/verifyRequirements";

export type ComparedProduct = {
  product: ProductRecord;
  verification: VerificationResult;
  score: number;
  advantages: string[];
  disadvantages: string[];
  unknowns: string[];
  rankReason: string;
};

function softScore(product: ProductRecord, criteria: ParsedCriterion[]): number {
  let score = 0;
  const preferWarranty = criteria.some((c) => c.key === "prefer_warranty");
  if (preferWarranty && product.warranty) {
    const years = Number((product.warranty.match(/(\d+)\s*year/i) ?? [])[1] ?? 0);
    score += years * 10;
  }
  // Prefer lower price within passers
  score += Math.max(0, 20000 - product.priceInr) / 1000;
  if (product.missingFields.length === 0) score += 5;
  score -= product.missingFields.length * 2;
  return score;
}

export function compareProducts(
  products: ProductRecord[],
  criteria: ParsedCriterion[],
): ComparedProduct[] {
  const compared = products.map((product) => {
    const verification = verifyProductRequirements(product, criteria);
    const advantages: string[] = [];
    const disadvantages: string[] = [];
    const unknowns: string[] = [...product.missingFields];

    for (const check of verification.checks) {
      if (check.status === "satisfied") advantages.push(`${check.label}: ${check.evidence}`);
      if (check.status === "violated") disadvantages.push(`${check.label}: ${check.evidence}`);
      if (check.status === "unverifiable") unknowns.push(`${check.label}: ${check.evidence}`);
    }

    let score = softScore(product, criteria);
    if (verification.overall === "fail") score = -10000 + score;
    if (verification.overall === "uncertain") score = -1000 + score;

    const rankReason =
      verification.overall === "fail"
        ? "Hard constraint violation — ranked below eligible options"
        : verification.overall === "uncertain"
          ? "Missing hard-requirement evidence — ranked below verified matches"
          : "Passes hard constraints; ranked by warranty preference and known price";

    return {
      product,
      verification,
      score,
      advantages,
      disadvantages,
      unknowns,
      rankReason,
    };
  });

  return compared.sort((a, b) => b.score - a.score);
}
