# Neko Nap

A gentle, local-first nap companion with ambient audio, an optional next-event buffer, wake check-ins, and a private on-device nap history.

**Live app:** https://rintss.github.io/neko-nap/

## Current features

- 20, 45, and 90 minute presets plus a 1–720 minute custom timer
- Optional next-event label, date/time, and preparation-buffer warning
- Built-in purr, rain, and ocean audio, silence, or a device-selected audio file
- Persisted absolute wake timestamps, so refreshing does not restart a nap
- Wake check-in with outcome, optional factors, and a short note
- Editable and deletable local nap history with cautious pattern summaries
- JSON backup export and non-destructive import
- Remembered timer, sound, volume, and next-event preferences
- Home-screen metadata and offline caching for the core app and built-in media
- Reduced-motion support and a manual static-cat control

## Privacy and storage

- Active naps, preferences, and history stay in browser storage on this device.
- A selected custom audio file is stored in IndexedDB when the browser has enough space. It is never uploaded or included in JSON backups.
- Importing a backup merges by record ID. Matching IDs use the imported version; unrelated existing records remain.
- There are no accounts, analytics, or cloud synchronization.

## Browser limitations

- The web app cannot guarantee an alarm after iOS locks or suspends the page. Use a device alarm when waking at an exact time matters.
- After a page reload, browsers block automatic audio playback. Neko Nap restores the timer and exposes a **Continue sound** control.
- Reliable background audio, lock-screen alarms, and system notifications require a future native Capacitor build.

## Development

```sh
git clone https://github.com/rintss/neko-nap.git
cd neko-nap
bun install
bun run dev
```

Use `bun run lint`, `bun run build`, and `bun run smoke` before committing. The smoke check verifies the generated GitHub Pages shell, local media, icons, manifest, and offline worker. GitHub Actions repeats these checks and deploys `main` to GitHub Pages.

## Stack

- TanStack Start
- React and TypeScript
- Tailwind CSS
- Standard Vite/TanStack/Nitro build configuration
- GitHub Actions and GitHub Pages
