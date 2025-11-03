self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("sync", async (event) => {
  if (event.tag === "sync-notifications") {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: "SYNC_NOTIFICATIONS" });
    }
  }
});