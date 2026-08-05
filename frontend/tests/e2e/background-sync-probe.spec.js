import { chromium, expect, firefox, test } from "@playwright/test";

test("the isolated probe reports Chromium support and Firefox fallback", async ({ baseURL }) => {
  const cases = [
    { name: "Chromium", browserType: chromium, backgroundSync: "Supported" },
    { name: "Firefox", browserType: firefox, backgroundSync: "Unsupported" },
  ];

  for (const browserCase of cases) {
    const browser = await browserCase.browserType.launch();
    const page = await browser.newPage();
    await page.goto(`${baseURL}/capture-sync-probe/index.html`);

    await expect(page.getByText("Background Sync Probe", { exact: true })).toBeVisible();
    await expect(page.locator("#service-worker")).toHaveText("Supported");
    await expect(page.locator("#background-sync")).toHaveText(browserCase.backgroundSync);
    if (browserCase.backgroundSync === "Supported") {
      await page.getByRole("button", { name: "Queue offline test" }).click();
      // Headless Chromium exposes SyncManager but can disable registration at
      // the runtime level. Either result proves the probe records more than
      // interface presence; only real-device background-pass is release evidence.
      await expect(page.locator("#outcome")).toHaveText(/foreground-fallback|registration-failed/);
    } else {
      await expect(page.getByRole("button", { name: "Queue offline test" })).toBeDisabled();
    }

    await browser.close();
  }
});
