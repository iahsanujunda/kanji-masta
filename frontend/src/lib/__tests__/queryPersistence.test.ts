import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearPersistedQueryCache,
  persistUserQueryCache,
  restoreUserQueryCache,
} from "@/lib/queryPersistence";

const userOne = "cache-user-one";
const userTwo = "cache-user-two";

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("private query persistence", () => {
  afterEach(async () => {
    await clearPersistedQueryCache(userOne);
    await clearPersistedQueryCache(userTwo);
  });

  it("restores allowlisted data only for the user who owns it", async () => {
    const source = client();
    source.setQueryData(["user-summary", userOne], { streak: 12 });
    source.setQueryData(["kanji-list", userOne], [{ character: "木" }]);
    source.setQueryData(["admin-jobs", userOne], { jobs: [{ id: "private-job" }] });
    source.setQueryData(["photo-session", userOne, "scan-1"], { signedUrl: "https://signed.example/photo" });
    await persistUserQueryCache(source, userOne);

    const restoredOwner = client();
    expect(await restoreUserQueryCache(restoredOwner, userOne)).toBe(true);
    expect(restoredOwner.getQueryData(["user-summary", userOne])).toEqual({ streak: 12 });
    expect(restoredOwner.getQueryData(["kanji-list", userOne])).toEqual([{ character: "木" }]);
    expect(restoredOwner.getQueryData(["admin-jobs", userOne])).toBeUndefined();
    expect(restoredOwner.getQueryData(["photo-session", userOne, "scan-1"])).toBeUndefined();

    const differentUser = client();
    expect(await restoreUserQueryCache(differentUser, userTwo)).toBe(false);
    expect(differentUser.getQueryData(["user-summary", userOne])).toBeUndefined();
  });

  it("removes persisted data when explicitly cleared", async () => {
    const source = client();
    source.setQueryData(["user-summary", userOne], { streak: 12 });
    await persistUserQueryCache(source, userOne);

    await clearPersistedQueryCache(userOne);

    expect(await restoreUserQueryCache(client(), userOne)).toBe(false);
  });
});
