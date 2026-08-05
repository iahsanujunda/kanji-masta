import { expect, test } from "@playwright/test";
import { authenticate } from "./auth";

const apiOrigin = "http://127.0.0.1:18080";

test("a photo survives closing the app and resumes through completed results", async ({ page, request }) => {
  await request.post(`${apiOrigin}/__test/reset`);
  await authenticate(page);

  let storageOnline = false;
  let successfulUploads = 0;
  await page.route("http://127.0.0.1:15432/storage/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const isUpload = route.request().method() === "POST" && url.pathname.includes("/object/photos/");
    const isSignedUrl = route.request().method() === "POST" && url.pathname.includes("/object/sign/photos/");

    if (!storageOnline && (isUpload || isSignedUrl)) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: "503", error: "Service unavailable", message: "Storage offline" }),
      });
      return;
    }

    if (isUpload) {
      successfulUploads += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Id: "photo-1", Key: url.pathname.split("/object/")[1] }),
      });
      return;
    }

    if (isSignedUrl) {
      const objectPath = url.pathname.split("/object/sign/")[1];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ signedURL: `/object/sign/${objectPath}?token=e2e-token` }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: "image/jpeg", body: "photo" });
  });

  await page.goto("/capture");
  await page.locator('input[type="file"]').setInputFiles({
    name: "commute.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("commute photo"),
  });

  await expect(page).toHaveURL(/\/captures\/[0-9a-f-]+$/, { timeout: 15_000 });
  await expect(page.getByText("You can close the app")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/captures\/[0-9a-f-]+$/);
  await expect(page.getByText("Analysing", { exact: true })).toBeVisible();
  await expect(page.getByText("You can close the app")).toBeVisible();

  storageOnline = true;
  await request.post(`${apiOrigin}/__test/capture-state`, { data: { online: true } });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(page).toHaveURL(/\/scans\/session-1$/, { timeout: 15_000 });
  await expect(page.getByText("Analysing", { exact: true })).toBeVisible();
  expect(successfulUploads).toBe(1);
  await expect.poll(async () => (await request.get(`${apiOrigin}/__test/capture-metrics`)).json()).toMatchObject({
    analyzeCalls: 1,
    sessionCount: 1,
  });

  await page.getByRole("button", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Session Active", { exact: true })).toBeVisible();
  await expect(page.getByText("Analysing your photo", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.getByText("Analysing photo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Activity" }).click();

  await request.post(`${apiOrigin}/__test/capture-state`, { data: { status: "done" } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Activity, new updates" })).toBeVisible();
  await page.getByRole("button", { name: "Activity, new updates" }).click();
  await expect(page.getByText("Scan ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activity" })).toBeVisible();

  await page.getByText("Scan ready", { exact: true }).click();
  await expect(page).toHaveURL(/\/scans\/session-1$/);
  await expect(page.getByText("Found Kanji", { exact: true })).toBeVisible();
  await expect(page.getByText("1 detected", { exact: true })).toBeVisible();
  await expect(page.getByText("駅", { exact: true })).toBeVisible();
});
