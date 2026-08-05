import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

describe("apiFetch authentication boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends the current session token to private endpoints", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "current-token" } as never },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/private");

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/private"), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer current-token" }),
    }));
  });

  it("signs out when the backend rejects an expired session", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "expired-token" } as never },
      error: null,
    });
    const signOut = vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(apiFetch("/api/private")).rejects.toThrow("Access denied");

    expect(signOut).toHaveBeenCalledOnce();
  });
});
