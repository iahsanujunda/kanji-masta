import { describe, expect, it, vi } from "vitest";
import { preloadAuthenticatedRoutes } from "@/lib/routePreloading";

describe("authenticated route preloading", () => {
  it("loads every supplied route and tolerates an optional route failure", async () => {
    const loaded = vi.fn().mockResolvedValue({});
    const unavailable = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(preloadAuthenticatedRoutes([loaded, unavailable])).resolves.toBeUndefined();

    expect(loaded).toHaveBeenCalledOnce();
    expect(unavailable).toHaveBeenCalledOnce();
  });
});
