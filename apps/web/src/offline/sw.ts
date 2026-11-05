/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Versioned app shell and static assets only. API responses are never stored by the worker:
// private data lives in IndexedDB, which logout wipes.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      async () => (await caches.match("/index.html", { ignoreSearch: true })) ?? Response.error(),
    ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("push", (event) => {
  const message = (event.data?.json() ?? {}) as { title?: string; body?: string; link?: string };
  event.waitUntil(
    self.registration.showNotification(message.title ?? "LifeOS", {
      body: message.body,
      icon: "/icons/icon.svg",
      data: { link: message.link ?? "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow((event.notification.data as { link: string }).link));
});
