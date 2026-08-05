import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from "@tanstack/react-query";
import { openDB, type DBSchema } from "idb";

interface PersistedUserQueries {
  userId: string;
  version: number;
  persistedAt: number;
  state: DehydratedState;
}

interface QueryCacheDatabase extends DBSchema {
  caches: {
    key: string;
    value: PersistedUserQueries;
  };
}

const DATABASE_NAME = "kanji-masta-query-cache";
const CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
const PERSISTED_QUERY_ROOTS = new Set([
  "user-summary",
  "kanji-list",
  "words",
  "word-reference",
  "settings",
  "curriculum",
  "curriculum-detail",
]);

const database = openDB<QueryCacheDatabase>(DATABASE_NAME, 1, {
  upgrade(db) {
    db.createObjectStore("caches", { keyPath: "userId" });
  },
});

function belongsToUser(query: Query, userId: string): boolean {
  const [root, owner] = query.queryKey;
  return typeof root === "string" && PERSISTED_QUERY_ROOTS.has(root) && owner === userId;
}

export async function persistUserQueryCache(queryClient: QueryClient, userId: string): Promise<void> {
  const state = dehydrate(queryClient, {
    shouldDehydrateQuery: (query) => query.state.status === "success" && belongsToUser(query, userId),
  });
  const db = await database;
  await db.put("caches", {
    userId,
    version: CACHE_VERSION,
    persistedAt: Date.now(),
    state,
  });
}

export async function restoreUserQueryCache(queryClient: QueryClient, userId: string): Promise<boolean> {
  const db = await database;
  const persisted = await db.get("caches", userId);
  if (!persisted) return false;
  if (persisted.version !== CACHE_VERSION || Date.now() - persisted.persistedAt > MAX_CACHE_AGE_MS) {
    await db.delete("caches", userId);
    return false;
  }
  hydrate(queryClient, persisted.state);
  return true;
}

export async function clearPersistedQueryCache(userId: string): Promise<void> {
  const db = await database;
  await db.delete("caches", userId);
}

export function subscribeToUserQueryPersistence(queryClient: QueryClient, userId: string): () => void {
  let timer: number | undefined;
  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void persistUserQueryCache(queryClient, userId);
    }, 250);
  });
  return () => {
    unsubscribe();
    window.clearTimeout(timer);
  };
}
