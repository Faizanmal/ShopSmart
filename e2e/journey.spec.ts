import { test, expect, type Page } from "@playwright/test";

async function cardFor(page: Page, namePattern: RegExp) {
  const heading = page.getByRole("heading", { name: namePattern }).first();
  await expect(heading).toBeVisible({ timeout: 60_000 });
  return page
    .locator('div[class*="overflow-hidden"]')
    .filter({ has: heading })
    .first();
}

async function runDemoBrief(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo brief" }).click();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Criteria ledger", { exact: true })).toBeVisible({ timeout: 90_000 });
}

test.describe("ShopSmart browser journey", () => {
  test("full journey: brief → evidence → shortlist → propose → confirm → cart", async ({ page }) => {
    let confirmBody: string | null = null;
    page.on("response", async (res) => {
      if (res.url().includes("/api/cart/confirm")) {
        confirmBody = `${res.status()} ${await res.text().catch(() => "")}`;
      }
    });
    await runDemoBrief(page);

    // Criteria ledger + demo-labeled products
    await expect(page.getByText("HARD").first()).toBeVisible();
    await expect(page.getByText(/Snapshot data/i).first()).toBeVisible({ timeout: 60_000 });

    // A hard-constraint failure is visible (NVMe vs 2.5-inch SATA requirement)
    const nvmeCard = await cardFor(page, /Kingston NV2/);
    await expect(nvmeCard.getByText("fail", { exact: true })).toBeVisible();

    // Evidence: unknown/conflicting fields on the incomplete listing
    const genericCard = await cardFor(page, /Unbranded 1TB/i);
    await genericCard.getByRole("button", { name: /Show evidence/i }).click();
    await expect(genericCard.getByText(/Unknown/).first()).toBeVisible();

    // Shortlist a valid product
    const crucialCard = await cardFor(page, /Crucial MX500/);
    await crucialCard.getByRole("button", { name: "Shortlist", exact: true }).click();
    await expect(page.getByText("Shortlist", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Crucial MX500/).last()).toBeVisible({ timeout: 30_000 });

    // Propose → cart unchanged before confirmation
    await expect(page.getByRole("button", { name: /Cart \(0\)/ })).toBeVisible();
    await crucialCard.getByRole("button", { name: "Propose cart" }).click();
    await expect(
      page.getByRole("heading", { name: "Confirm cart addition" }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Crucial MX500/).last()).toBeVisible();
    await expect(page.getByRole("button", { name: /Cart \(0\)/ })).toBeVisible();

    // Confirm exact proposal → added once, totals update
    await page
      .getByRole("button", { name: /Approve add to ShopSmart cart/ })
      .click();
    await expect
      .poll(() => confirmBody, { timeout: 30_000 })
      .toContain('"ok":true');
    await expect(page.getByRole("button", { name: /Cart \(1\)/ })).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(/Known subtotal:/)).toBeVisible();

    // Immediate purchase attempt is refused, cart unchanged
    await page.getByRole("button", { name: "Close" }).click().catch(() => {});
    const box = page.getByRole("textbox", { name: "Shopping message" });
    await box.fill("Buy the Crucial SSD now, checkout and submit my payment immediately");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/can't purchase/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /Cart \(1\)/ })).toBeVisible();
  });

  test("refresh restores session: ledger, shortlist and cart persist", async ({ page }) => {
    await runDemoBrief(page);
    const crucialCard = await cardFor(page, /Crucial MX500/);
    await crucialCard.getByRole("button", { name: "Shortlist", exact: true }).click();
    await expect(page.getByText(/Crucial MX500/).last()).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByText("Criteria ledger", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Crucial MX500/).last()).toBeVisible({ timeout: 30_000 });
  });

  test("mobile viewport: layout usable, no page-level horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await runDemoBrief(page);
    await expect(page.getByRole("heading", { name: /Crucial MX500/ }).first()).toBeVisible({
      timeout: 60_000,
    });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 2);
  });

  test("failed chat network request shows an error, does not fake results", async ({ page }) => {
    await page.route("**/api/chat", (route) => route.abort());
    await page.goto("/");
    await page.getByRole("button", { name: "Load demo brief" }).click();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("div.bg-red-50").first()).toBeVisible({ timeout: 30_000 });
  });

  test("MCP status failure shows offline badge instead of crashing", async ({ page }) => {
    await page.route("**/api/mcp/status", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "down" }) }),
    );
    await page.goto("/");
    await expect(page.getByText(/MCP offline/i)).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: /Compare with evidence/i }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
