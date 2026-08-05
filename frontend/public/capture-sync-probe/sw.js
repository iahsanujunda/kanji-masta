const DATABASE_NAME = "capture-resilience-sync-probe";
const STORE_NAME = "runs";
const CURRENT_RUN = "current";
const SYNC_TAG = "capture-resilience-background-sync";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateRun(changes) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(CURRENT_RUN);
    getRequest.onsuccess = () => {
      const current = getRequest.result ?? { id: CURRENT_RUN };
      store.put({ ...current, ...changes });
    };
    getRequest.onerror = () => reject(getRequest.error);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function runConnectivityProbe() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const visibleClientCount = windows.filter((client) => client.visibilityState === "visible").length;
  const attempt = {
    syncAttemptedAt: new Date().toISOString(),
    windowClientCount: windows.length,
    visibleClientCount,
  };

  try {
    const response = await fetch(`./probe-ping.json?sync=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Probe returned ${response.status}`);
    await updateRun({
      ...attempt,
      status: "completed",
      syncCompletedAt: new Date().toISOString(),
      outcome: visibleClientCount === 0 ? "background-pass" : "foreground-fallback",
      lastError: null,
    });
  } catch (error) {
    await updateRun({
      ...attempt,
      status: "retrying",
      lastError: error instanceof Error ? error.message : "Connectivity probe failed",
    });
    throw error;
  }
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(runConnectivityProbe());
});
