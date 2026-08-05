import { expect, test } from "@playwright/test";
import { authenticate } from "./auth";

async function assertVisibleDrawerMotion(page, trigger, drawerName, dismissName = "Close") {
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: drawerName });
  await expect(drawer).toBeAttached();
  const duration = await drawer.evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(["0.3s", "300ms"]).toContain(duration);

  await page.waitForTimeout(100);
  const entering = await drawer.boundingBox();
  const viewport = page.viewportSize();
  expect(entering).not.toBeNull();
  expect(entering.y).toBeGreaterThan(viewport.height - entering.height);
  expect(entering.y).toBeLessThan(viewport.height);

  await page.waitForTimeout(240);
  const open = await drawer.boundingBox();
  expect(Math.abs(open.y - (viewport.height - open.height))).toBeLessThan(2);
  expect(open.width).toBeLessThanOrEqual(480);

  const drawerHandle = await drawer.elementHandle();
  await drawer.getByRole("button", { name: dismissName }).last().click();
  await page.waitForTimeout(100);
  const exiting = await drawerHandle.boundingBox();
  expect(exiting).not.toBeNull();
  expect(exiting.y).toBeGreaterThan(viewport.height - exiting.height);
  expect(exiting.y).toBeLessThan(viewport.height);
  const exitDuration = await drawerHandle.evaluate((node) => getComputedStyle(node).transitionDuration);
  expect(["0.26s", "260ms"]).toContain(exitDuration);

  await page.waitForTimeout(200);
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
}

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:18080/__test/reset");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await authenticate(page);
  await page.goto("/admin");
  await expect(page.getByText("Operational", { exact: true })).toBeVisible();
});

test("model settings lead the jobs panel and submit the active selection", async ({ page }) => {
  const modelSettings = page.getByText("Model settings", { exact: true });
  const firstJob = page.getByRole("button", { name: /View Photo analysis job/ });
  await expect(modelSettings).toBeVisible();
  await expect(page.getByText("vision/current", { exact: true })).toBeVisible();
  expect((await modelSettings.boundingBox()).y).toBeLessThan((await firstJob.boundingBox()).y);

  await page.getByRole("button", { name: "Change Photo analysis model" }).click();
  await page.getByRole("button", { name: /Qwen Vision/ }).click();
  const submit = page.getByRole("button", { name: "Submit" });
  await submit.click();
  await expect(submit.getByRole("progressbar")).toBeVisible();
  await expect(page.getByText("Model configuration saved.", { exact: true })).toBeVisible();
  await expect(page.getByText("qwen/qwen-vision", { exact: true })).toBeVisible();
});

test("job, model, and invite drawers visibly enter and exit", async ({ page }) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("openrouter.ai")) externalRequests.push(request.url());
  });

  await assertVisibleDrawerMotion(
    page,
    page.getByRole("button", { name: /View Photo analysis job/ }),
    "Job details",
  );
  await assertVisibleDrawerMotion(
    page,
    page.getByRole("button", { name: "Change Photo analysis model" }),
    "Search OpenRouter models",
    "Cancel",
  );

  await page.getByRole("button", { name: "Invites" }).click();
  await assertVisibleDrawerMotion(
    page,
    page.getByRole("button", { name: "Create invite" }),
    "Create invite",
    "Cancel",
  );
  expect(externalRequests).toEqual([]);
});

test("drawer stays narrow on desktop and reduced motion remains functional", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const trigger = page.getByRole("button", { name: /View Photo analysis job/ });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Job details" });
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox()).width).toBeLessThanOrEqual(480);
  await drawer.getByRole("button", { name: "Close" }).last().click();
  await expect(drawer).toBeHidden();
});
