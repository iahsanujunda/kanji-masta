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
  await expect(page.getByRole("heading", { name: "Keep the Japanese you notice." })).toBeVisible();
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

test("a restored session never paints the public landing page", async ({ page }) => {
  await page.addInitScript(() => {
    window.__landingWasPainted = false;
    const watch = () => {
      if (document.body?.innerText.includes("Keep the Japanese you notice.")) {
        window.__landingWasPainted = true;
      }
    };
    new MutationObserver(watch).observe(document, { childList: true, subtree: true });
  });
  await authenticate(page);

  await page.goto("/");

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText(/You are on 12 day streak/)).toBeVisible();
  expect(await page.evaluate(() => window.__landingWasPainted)).toBe(false);
});

test("navigation and reload reuse the signed-in learner cache", async ({ page, request }) => {
  await request.post("http://127.0.0.1:18080/__test/reset");
  await authenticate(page);
  await page.goto("/home");
  await expect(page.getByText(/You are on 12 day streak/)).toBeVisible();

  await page.getByText("Your Kanji", { exact: true }).click();
  await expect(page.getByRole("img", { name: "A low-poly kanji learning tree" })).toBeVisible();
  await page.goBack();
  await expect(page.getByText(/You are on 12 day streak/)).toBeVisible();

  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.getByText(/You are on 12 day streak/)).toBeVisible();

  const metrics = await (await request.get("http://127.0.0.1:18080/__test/request-metrics")).json();
  expect(metrics.counts["/api/user/summary"]).toBe(1);
  expect(metrics.counts["/api/kanji/list"]).toBe(1);
});

test("Activity drawer visibly enters and exits without an empty-state action", async ({ page, request }) => {
  await request.post("http://127.0.0.1:18080/__test/reset");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await authenticate(page);
  await page.goto("/home");
  const trigger = page.getByRole("button", { name: "Activity" });

  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Activity" });
  await expect(drawer).toBeAttached();
  expect(["0.3s", "300ms"]).toContain(await drawer.evaluate((node) => getComputedStyle(node).transitionDuration));

  await page.waitForTimeout(100);
  const entering = await drawer.boundingBox();
  const viewport = page.viewportSize();
  expect(entering.y).toBeGreaterThan(viewport.height - entering.height + 1);
  expect(entering.y).toBeLessThan(viewport.height);

  await page.waitForTimeout(240);
  const opened = await drawer.boundingBox();
  expect(Math.abs(opened.y - (viewport.height - opened.height))).toBeLessThan(2);
  expect(opened.width).toBeLessThanOrEqual(480);
  await expect(drawer.getByText("No scan activity yet", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Capture Japanese/i })).toHaveCount(0);

  const drawerHandle = await drawer.elementHandle();
  await drawer.getByRole("button", { name: "Close Activity" }).click();
  await page.waitForTimeout(100);
  const exiting = await drawerHandle.boundingBox();
  expect(exiting.y).toBeGreaterThan(viewport.height - exiting.height + 1);
  expect(exiting.y).toBeLessThan(viewport.height);
  expect(["0.26s", "260ms"]).toContain(await drawerHandle.evaluate((node) => getComputedStyle(node).transitionDuration));
  await page.waitForTimeout(200);
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});
