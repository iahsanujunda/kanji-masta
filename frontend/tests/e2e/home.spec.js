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

test("protected pages redirect visitors without a Supabase session", async ({ page }) => {
  await page.goto("/home");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /Don't study Japanese/i })).toBeVisible();
});

test("authenticated learners see their dashboard and can open the collection", async ({ page }) => {
  await authenticate(page);
  await page.goto("/home");

  await expect(page.getByText(/You are on 12 day streak/)).toBeVisible();
  await expect(page.getByText("4 learning", { exact: true })).toBeVisible();
  await expect(page.getByText("2 familiar", { exact: true })).toBeVisible();
  await expect(page.getByText("6 saved words", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture Japanese" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByText("Your Kanji", { exact: true }).click();

  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.getByRole("img", { name: "A low-poly kanji learning tree" })).toBeVisible();
});
