const APP_BASE_URL = import.meta.env.BASE_URL;
const APP_SERVICE_WORKER_PATH = `${APP_BASE_URL}sw.js`;

async function unregisterAppWorker() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter(
        (registration) =>
          new URL(registration.active?.scriptURL ?? APP_SERVICE_WORKER_PATH, window.location.origin)
            .pathname === APP_SERVICE_WORKER_PATH,
      )
      .map((registration) => registration.unregister()),
  );
}

export async function initializePwa() {
  if (!("serviceWorker" in navigator)) return;

  const shouldRefuse =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (shouldRefuse) {
    await unregisterAppWorker();
    return;
  }

  try {
    await navigator.serviceWorker.register(APP_SERVICE_WORKER_PATH, { scope: APP_BASE_URL });
  } catch {
    // The timer remains fully usable when service-worker registration is unavailable.
  }
}
