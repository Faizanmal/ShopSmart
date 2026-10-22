export type EvidenceClaim = {
  claim: string;
  source: string;
  status: "verified" | "provider_claim" | "estimate" | "inferred" | "unknown";
};

export type ProductRecord = {
  id: string;
  name: string;
  brand: string;
  model: string | null;
  variant: string | null;
  category: string;
  description: string;
  priceInr: number;
  currency: string;
  imageUrl: string | null;
  sourceUrl: string;
  retailer: string;
  seller: string | null;
  availability: string | null;
  specs: Record<string, string | number | boolean | null>;
  warranty: string | null;
  deliveryInfo: string | null;
  evidence: EvidenceClaim[];
  missingFields: string[];
  conflictingFields: string[];
  dataProvider: "DEMO" | "LIVE";
  lastVerifiedAt: string;
};

export type SearchProductsInput = {
  query?: string;
  category?: string;
  budgetMinInr?: number;
  budgetMaxInr?: number;
  brand?: string;
  limit?: number;
};

export interface ProductProvider {
  readonly mode: "DEMO" | "LIVE";
  search(input: SearchProductsInput): Promise<ProductRecord[]>;
  getById(id: string): Promise<ProductRecord | null>;
}
