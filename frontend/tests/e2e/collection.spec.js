import { expect, test } from "@playwright/test";
import { authenticate } from "./auth";

async function expectNoHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))).toEqual({
    clientWidth: page.viewportSize().width,
    scrollWidth: page.viewportSize().width,
  });
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await page.goto("/collection");
  await expect(page.getByRole("heading", { name: "Your Kanji" })).toBeVisible();
});

test("renders the interactive tree and its learning-zone totals on mobile", async ({ page }) => {
  const tree = page.getByRole("img", { name: "A low-poly kanji learning tree" });
  const mastered = page.getByText("Mastered", { exact: true }).locator("..");
  const growing = page.getByText("Growing", { exact: true }).locator("..");
  const seeded = page.getByText("Seeded", { exact: true }).locator("..");

  await expect(tree).toBeVisible();
  await expect(mastered).toContainText("2");
  await expect(growing).toContainText("2");
  await expect(seeded).toContainText("2");
  await expectNoHorizontalOverflow(page);

  await mastered.hover();
  const zones = tree.locator(":scope > g");
  await expect(zones.nth(0)).toHaveCSS("opacity", "0.3");
  await expect(zones.nth(1)).toHaveCSS("opacity", "0.3");
  await expect(zones.nth(2)).toHaveCSS("opacity", "1");
});

test("opens a filtered tier from the tree summary", async ({ page }) => {
  await page.getByText("Mastered", { exact: true }).click();

  await expect(page).toHaveURL(/\/collection\/list\?zone=canopy$/);
  await expect(page.getByRole("heading", { name: "Mastered" })).toBeVisible();
  await expect(page.getByText("2 kanji · Tier 4-5", { exact: true })).toBeVisible();
  await expect(page.getByText("木", { exact: true })).toBeVisible();
  await expect(page.getByText("学", { exact: true })).toBeVisible();
  await expect(page.getByText("読", { exact: true })).toHaveCount(0);
});
