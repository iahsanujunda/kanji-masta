import { expect, test } from "@playwright/test";

test("presents the real-world learning loop to unregistered mobile visitors", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Keep the Japanese you notice." })).toBeVisible();
  await expect(page.getByRole("img", { name: /Nakano Station becomes a saved word/i })).toBeVisible();
  await expect(page.getByText("Notice it", { exact: true })).toBeVisible();
  await expect(page.getByText("Keep it", { exact: true })).toBeVisible();
  await expect(page.getByText("Recall it", { exact: true })).toBeVisible();

  await expect.poll(() => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))).toEqual({
    clientWidth: page.viewportSize().width,
    scrollWidth: page.viewportSize().width,
  });

  await page.getByRole("button", { name: "Start collecting" }).first().click();
  await expect(page).toHaveURL(/\/signup$/);

  await page.goBack();
  await page.getByRole("button", { name: "Log in" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});
