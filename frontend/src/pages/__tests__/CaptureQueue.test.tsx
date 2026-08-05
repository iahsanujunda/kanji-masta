import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CaptureQueue from "@/pages/CaptureQueue";
import { deleteLocalCapturesForUser, saveLocalCapture, type LocalCaptureStatus } from "@/lib/captureQueue";
import { renderWithProviders } from "@/test/mocks";

const userId = "test-user";

function capture(status: LocalCaptureStatus, index: number) {
  const id = `queue-${status}-${index}`;
  const blob = new Blob([`photo-${index}`], { type: "image/jpeg" });
  return {
    id,
    userId,
    blob,
    byteSize: blob.size,
    storagePath: `${userId}/${id}.jpg`,
    status,
    attempts: status === "pending" ? 0 : 1,
    lastError: status === "failed" ? "Image could not be uploaded" : undefined,
    createdAt: new Date(Date.now() - index * 60_000).toISOString(),
  };
}

describe("CaptureQueue", () => {
  beforeEach(async () => {
    await deleteLocalCapturesForUser(userId);
  });

  it("shows multiple waiting, uploading, sign-in, and failed captures", async () => {
    await saveLocalCapture(capture("pending", 0));
    await saveLocalCapture(capture("uploading", 1));
    await saveLocalCapture(capture("needs-auth", 2));
    await saveLocalCapture(capture("failed", 3));

    renderWithProviders(<CaptureQueue />, { route: "/captures" });

    expect(await screen.findByText("4 photos saved")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.getByText("Uploading")).toBeInTheDocument();
    expect(screen.getByText("Needs sign-in")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open saved photo" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "Remove saved photo" })).toHaveLength(4);
  });

  it("requires confirmation before deleting the only unowned photo", async () => {
    await saveLocalCapture(capture("pending", 0));
    renderWithProviders(<CaptureQueue />, { route: "/captures" });
    await screen.findByText("1 photo saved");

    await userEvent.click(screen.getByRole("button", { name: "Remove saved photo" }));
    expect(screen.getByText("This photo has not reached the server. Removing it cannot be undone.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.getByText("0 photos saved")).toBeInTheDocument());
    expect(screen.getByText("No photos waiting")).toBeInTheDocument();
  });
});
