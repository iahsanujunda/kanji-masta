import { describe, expect, it, vi } from "vitest";
import { createAppQueryClient } from "@/lib/queryClient";

describe("application query defaults", () => {
  it("reuses recently fetched data instead of requesting it again", async () => {
    const queryClient = createAppQueryClient();
    const queryFn = vi.fn().mockResolvedValue({ streak: 12 });
    const query = { queryKey: ["user-summary", "user-one"], queryFn } as const;

    await queryClient.fetchQuery(query);
    await queryClient.fetchQuery(query);

    expect(queryFn).toHaveBeenCalledOnce();
  });
});
