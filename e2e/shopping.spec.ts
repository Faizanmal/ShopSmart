import { test, expect } from "@playwright/test";

test.describe("ShopSmart core flow", () => {
  test("loads UI and shows branding", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("ShopSmart").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Compare with evidence/i }),
    ).toBeVisible();
  });

  test("demo brief produces criteria and products", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Load demo brief" }).click();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Criteria ledger", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("HARD").first()).toBeVisible();
    await expect(page.getByText(/Snapshot data/i).first()).toBeVisible({ timeout: 60_000 });
  });
});
