> [!IMPORTANT]
> Avoid rewriting published git history. Keep `main` deployable and make normal
> forward commits so GitHub Pages can always roll back to a known-good build.

## Project architecture

- Keep Neko Nap local-first: active sessions, preferences, and history use on-device storage because v0.1 requires privacy and no accounts.
- Derive all running-session timing from persisted absolute timestamps because browser timer ticks are not reliable after suspension.
- Keep the full v0.1 experience on the index route because it is one focused app flow rather than separate shareable content pages.
- Generate offline support with vite-plugin-pwa and register it only through the guarded client wrapper, because previews must never retain stale app caches.
- Render the repository-owned transparent cat PNG, with active-session breathing isolated to a clipped duplicate torso layer so the head and tail remain stationary.
- Serve the repository-owned purr, rain, and ocean recordings locally and loop them with one shared audio element so preview and nap playback use identical volume behavior.
- Route storage, audio, and wake-alert calls through src/platform/* adapters with feature checks, so a future Capacitor build can swap per-platform implementations without touching UI.
