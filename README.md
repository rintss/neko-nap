# Neko Nap

A gentle, local-first nap companion with ambient audio, an optional next-event buffer, wake check-ins, and a private on-device nap history.

**Live app:** https://rintss.github.io/neko-nap/

## Current features

- 20, 45, and 90 minute presets plus a 1–720 minute custom timer
- Optional next-event label, date/time, and preparation-buffer warning
- Built-in purr, rain, and ocean audio, silence, a device-selected audio file, or a saved YouTube BGM library
- Persisted absolute wake timestamps, so refreshing does not restart a nap
- Wake check-in with outcome, optional factors, and a short note
- Editable and deletable local nap history, including corrected start time and durations
- JSON backup export and non-destructive import
- Strict backup validation plus a clear warning if browser storage is blocked or full
- Remembered timer, sound, volume, and next-event preferences
- In-app install guidance plus offline caching for the core app and built-in media
- Reduced-motion support and a manual static-cat control

## Privacy and storage

- Active naps, preferences, and history stay in browser storage on this device.
- A selected custom audio file is stored in IndexedDB when the browser has enough space. It is never uploaded or included in JSON backups.
- Saved YouTube entries contain only the title and video ID. They stay in browser storage and are included in JSON backups; the privacy-enhanced YouTube player loads only when a YouTube nap begins.
- Importing a backup validates dates, record fields, and settings before it asks for confirmation, then merges by record ID. Matching IDs use the imported version; unrelated existing records remain.
- JSON backups include the static-cat preference. Custom audio remains device-only and is deliberately excluded.
- There are no accounts, analytics, or cloud synchronization.

## Browser limitations

- The web app cannot guarantee an alarm after iOS locks or suspends the page. Use a device alarm when waking at an exact time matters.
- After a page reload, browsers block automatic audio playback. Neko Nap restores the timer and exposes a **Continue sound** control.
- YouTube autoplay and embedding depend on browser policy and the video's owner. The visible player remains available when autoplay is blocked; some videos cannot play outside YouTube.
- Reliable background audio, lock-screen alarms, and system notifications require a future native Capacitor build.

## Development

```sh
git clone https://github.com/rintss/neko-nap.git
cd neko-nap
bun install
bun run dev
```

Use `bun run lint`, `bun run build`, `bun run smoke`, and `bun run test:e2e` before committing. The artifact smoke check verifies the generated GitHub Pages shell, local media, icons, manifest, and offline worker. Playwright covers the mobile nap/check-in/history flow, history corrections, YouTube BGM persistence and embed setup, malformed backup rejection, hidden-control accessibility, blocked-storage warning, and a true offline reload. GitHub Actions runs both suites before deploying `main` to GitHub Pages.

## Stack

- TanStack Start
- React and TypeScript
- Tailwind CSS
- Standard Vite/TanStack/Nitro build configuration
- GitHub Actions and GitHub Pages
