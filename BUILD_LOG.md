# Neko Nap — Build Log

Last reconciled: 2026-10-27

## 2026-10-22 — Local nap history became a complete workflow

- Added editable timing, wake check-ins, corrected start times and durations, and a private local nap history.
- Added strict JSON backup validation and non-destructive merge-by-record-ID import.
- Added install guidance, storage-failure warnings, offline reload coverage, and mobile end-to-end tests.
- Added a saved YouTube BGM library that stores only title and video ID. The privacy-enhanced player loads only when a YouTube nap begins; custom device audio remains device-only and outside JSON backups.
- Removed the remaining hosted-platform coupling and made GitHub Actions the tested release path.

## 2026-10-21 — Public boundary tightened

- Added crawler and referrer controls for the public PWA.
- Nap history, preferences, active timer state, and user-selected audio remain browser-local.

## 2026-10-03 — Independent release path

- Imported the last Lovable-backed baseline into the owner repository.
- Replaced remote asset pointers with repository-owned cat art and built-in sounds.
- Restored installable/offline behaviour and added a GitHub Pages deployment using Bun.
- Timer recovery uses an absolute wake time so a refresh does not silently restart a nap.

## Before the next change

- Treat `https://rintss.github.io/neko-nap/` as the public production surface.
- Check offline installation, timer recovery after refresh, and custom-audio non-upload behaviour.
- Do not add cloud sync unless it is an explicit product decision; current local-only storage is a privacy feature.
