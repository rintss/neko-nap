<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Project architecture

- Keep Neko Nap local-first: active sessions, preferences, and history use on-device storage because v0.1 requires privacy and no accounts.
- Derive all running-session timing from persisted absolute timestamps because browser timer ticks are not reliable after suspension.
- Keep the full v0.1 experience on the index route because it is one focused app flow rather than separate shareable content pages.
- Generate offline support with vite-plugin-pwa and register it only through the guarded client wrapper, because previews must never retain stale app caches.
- Render the user-provided transparent cat PNG through a CDN asset pointer, with active-session breathing isolated to a clipped duplicate torso layer so the head and tail remain stationary.
- Serve the built-in purr, rain, and ocean recordings through CDN asset pointers and loop them with one shared audio element so preview and nap playback use identical volume behavior.
- Route storage, audio, and wake-alert calls through src/platform/* adapters with feature checks, so a future Capacitor build can swap per-platform implementations without touching UI.
