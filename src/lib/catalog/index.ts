import { DemoCatalogProvider } from "./demoProvider";
import { LiveCatalogProvider, isLiveProviderConfigured } from "./liveProvider";
import type { ProductProvider } from "./types";

export * from "./types";
export { DemoCatalogProvider, LiveCatalogProvider };

export function getProductProvider(): ProductProvider {
  const mode = (process.env.PRODUCT_PROVIDER ?? "demo").toLowerCase();
  if (mode === "live") {
    if (isLiveProviderConfigured()) {
      return new LiveCatalogProvider();
    }
    // No key: fall back to the snapshot catalog with explicit labeling.
    // Never pretend snapshot data is live.
    console.warn(
      "[catalog] PRODUCT_PROVIDER=live requested but SERPAPI_API_KEY is not configured; using snapshot catalog (labelled as such).",
    );
  }
  return new DemoCatalogProvider();
}

export function activeCatalogMode(): "LIVE" | "DEMO" {
  return getProductProvider().mode;
}
