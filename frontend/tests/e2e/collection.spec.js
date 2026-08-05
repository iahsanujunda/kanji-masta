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

test("zooms the shared tree into the selected zone after navigation", async ({ page }) => {
  await expect(page.getByRole("img", { name: "A low-poly kanji learning tree" })).toBeVisible();

  await page.getByText("Mastered", { exact: true }).click();
  await page.waitForURL(/\/collection\/list\?zone=canopy$/);

  const treeBackdrop = page.getByTestId("zone-tree-backdrop");
  const samples = await treeBackdrop.evaluate(async (element) => {
    const sample = () => {
      const transform = getComputedStyle(element).transform;
      const matrix = transform === "none"
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(transform);
      return { scale: matrix.a, y: matrix.m42 };
    };

    const start = sample();
    await new Promise((resolve) => setTimeout(resolve, 180));
    const middle = sample();
    await new Promise((resolve) => setTimeout(resolve, 780));
    const end = sample();
    return { start, middle, end };
  });

  await expect(treeBackdrop.getByRole("img", { name: "A low-poly kanji learning tree" })).toBeVisible();
  expect(samples.middle.scale).toBeGreaterThan(samples.start.scale);
  expect(samples.end.scale).toBeGreaterThan(samples.middle.scale);
  expect(samples.end.scale).toBeGreaterThan(1.8);
  expect(Math.abs(samples.end.y - samples.start.y)).toBeGreaterThan(40);
});

test("keeps the focused tree anchored while a long tier scrolls", async ({ page }) => {
  const masteredKanji = Array.from({ length: 45 }, (_, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    character: String.fromCodePoint(0x4e00 + index),
    familiarity: index % 2 === 0 ? 5 : 4,
    meanings: [`fixture ${index + 1}`],
  }));

  await page.route("**/api/kanji/list", (route) => route.fulfill({ json: masteredKanji }));
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("kanji-masta-query-cache");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("caches", "readwrite");
      transaction.objectStore("caches").clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  await expect(page.getByText("45 Kanji", { exact: true })).toBeVisible();
  await page.getByText("Mastered", { exact: true }).click();

  const treeBackdrop = page.getByTestId("zone-tree-backdrop");
  await expect(page.getByRole("heading", { name: "Mastered" })).toBeVisible();
  await page.waitForTimeout(950);
  const beforeScroll = await treeBackdrop.boundingBox();
  expect(beforeScroll).not.toBeNull();

  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const afterScroll = await treeBackdrop.boundingBox();
  expect(afterScroll).not.toBeNull();

  expect(afterScroll.x).toBeCloseTo(beforeScroll.x, 0);
  expect(afterScroll.y).toBeCloseTo(beforeScroll.y, 0);
  expect(afterScroll.width).toBeCloseTo(beforeScroll.width, 0);
  expect(afterScroll.height).toBeCloseTo(beforeScroll.height, 0);
});
