# Neko Nap v0.1 plan

## What I’ll build

- A mobile-first Neko Nap home/setup screen with 20, 45, and 90 minute presets plus a 1–720 minute custom option.
- Optional “next thing” date/time, a 30-minute buffer warning, local wake-time preview, sound choice, volume, and a local audio-file picker.
- A deliberately quiet running screen: an original curled sleeping cat, subtle breathing and ear movement, small wake/next-event times, and collapsed secondary controls.
- A wake screen where the cat opens its eyes and stretches, with live time-to-event copy and neutral check-in choices: Slept, Rested awake, Could not rest, or Skip.
- A History view with editable/deletable local nap records and cautious pattern summaries that stay hidden until enough records exist.

## Behavior

- Store the planned wake as an absolute timestamp and recompute from the clock after reopening.
- Persist the active session, settings, imported audio where browser storage permits, and nap history on this device only.
- Play looping foreground rest audio and a distinct foreground wake sound; clearly disclose that locked/background alarm reliability is unverified and recommend setting the device alarm.
- Support ending early, stopping audio, reduced motion, and a static-cat option.

## Visual direction

- Warm oat paper-like background, charcoal type, muted sage and dusty blue, with restrained apricot highlights.
- Original hand-drawn cat and tiny domestic details, rounded but compact controls, soft outlines, abundant empty space, no gradients or heavy shadows.
- Responsive for phone and desktop, with large sleepy-friendly tap targets and accessible contrast.

## Technical details

- Implement as a single local-first TanStack Start page with React state and browser storage; no account or cloud sync.
- Use semantic design tokens in the global stylesheet and accessible reusable controls.
- Add route-specific title, description, Open Graph, and Twitter metadata.
- Validate the complete setup → running → wake → check-in → history flow in the live preview, including a 90-minute nap and mobile sizing.
