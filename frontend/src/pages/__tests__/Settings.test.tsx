import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "@/pages/Settings";
import {
  deleteLocalCapturesForUser,
  getLocalCapture,
  saveLocalCapture,
} from "@/lib/captureQueue";
import { supabase } from "@/lib/supabase";
import { renderWithProviders } from "@/test/mocks";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const captureId = "logout-capture";

async function saveQueuedPhoto() {
  await saveLocalCapture({
    id: captureId,
    userId: "test-user",
    blob: new Blob(["photo"], { type: "image/jpeg" }),
    storagePath: `test-user/${captureId}.jpg`,
    status: "pending",
    attempts: 0,
    createdAt: "2026-08-05T00:00:00.000Z",
  });
}

describe("Settings logout with locally saved captures", () => {
  beforeEach(async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ quizAllowancePerSlot: 5, slotDurationHours: 6 });
    vi.mocked(supabase.auth.signOut).mockClear();
    await deleteLocalCapturesForUser("test-user");
    await saveQueuedPhoto();
  });

  it("warns and keeps the photo when logout is cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProviders(<Settings />);

    await userEvent.click(screen.getByText("Logout"));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("remove 1 saved photo"));
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(await getLocalCapture(captureId)).toBeDefined();
    confirm.mockRestore();
  });

  it("deletes the user's local photos before confirmed logout", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(<Settings />);

    await userEvent.click(screen.getByText("Logout"));

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledOnce());
    await expect(getLocalCapture(captureId)).resolves.toBeUndefined();
    confirm.mockRestore();
  });
});
