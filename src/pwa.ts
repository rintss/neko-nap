const APP_SERVICE_WORKER_PATH = "/sw.js";

function isLovablePreview(hostname: string) {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

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
    isLovablePreview(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (shouldRefuse) {
    await unregisterAppWorker();
    return;
  }

  try {
    await navigator.serviceWorker.register(APP_SERVICE_WORKER_PATH, { scope: "/" });
  } catch {
    // The timer remains fully usable when service-worker registration is unavailable.
  }
}
