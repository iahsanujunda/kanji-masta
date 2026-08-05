import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ActiveScanCard, { type ActiveScanSource } from "@/components/scan/ActiveScanCard";
import type { LocalCapture, LocalCaptureStatus } from "@/lib/captureQueue";
import type { PhotoSessionStatus } from "@/lib/photo";
import { renderWithProviders } from "@/test/mocks";

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function localItem(status: LocalCaptureStatus): ActiveScanSource {
  const capture: LocalCapture = {
    id: `local-${status}`,
    userId: "test-user",
    storagePath: `test-user/local-${status}.jpg`,
    status,
    attempts: 0,
    createdAt: "2026-08-05T00:00:00.000Z",
  };
  return { source: "local", capture };
}

function serverItem(status: PhotoSessionStatus): ActiveScanSource {
  return {
    source: "server",
    scan: {
      sessionId: `server-${status}`,
      storagePath: null,
      status,
      createdAt: "2026-08-05T00:00:00.000Z",
      kanjiCount: status === "done" ? 3 : null,
    },
  };
}

const cases: Array<{ name: string; item: ActiveScanSource; title: RegExp; destination: string }> = [
  { name: "queued", item: localItem("pending"), title: /Waiting to upload/, destination: "/captures/local-pending" },
  { name: "uploading", item: localItem("uploading"), title: /Uploading saved photo/, destination: "/captures/local-uploading" },
  { name: "starting", item: localItem("starting"), title: /Uploading saved photo/, destination: "/captures/local-starting" },
  { name: "upload failure", item: localItem("failed"), title: /Upload needs attention/, destination: "/captures/local-failed" },
  { name: "expired auth", item: localItem("needs-auth"), title: /Sign in to continue/, destination: "/captures/local-needs-auth" },
  { name: "processing", item: serverItem("processing"), title: /Analysing your photo/, destination: "/scans/server-processing" },
  { name: "completed", item: serverItem("done"), title: /Scan ready/, destination: "/scans/server-done" },
  { name: "analysis failure", item: serverItem("failed"), title: /Scan needs attention/, destination: "/scans/server-failed" },
];

function renderCard(item: ActiveScanSource) {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<><ActiveScanCard item={item} /><LocationProbe /></>} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
  );
}

describe("ActiveScanCard", () => {
  it.each(cases)("opens the $name state by tap/click", async ({ item, title, destination }) => {
    renderCard(item);
    await userEvent.click(screen.getByRole("button", { name: title }));
    expect(screen.getByTestId("location")).toHaveTextContent(destination);
  });

  it.each(cases)("opens the $name state from the keyboard", async ({ item, title, destination }) => {
    renderCard(item);
    const card = screen.getByRole("button", { name: title });
    card.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("location")).toHaveTextContent(destination);
  });
});
