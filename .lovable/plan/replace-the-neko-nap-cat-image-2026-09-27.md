# Replace the Neko Nap cat image

## Changes

- Store the uploaded transparent PNG as an app asset without altering its pixels.
- Replace the current constructed cat artwork everywhere with the uploaded image, preserving its full aspect ratio and transparency with no crop, restyling, or shadow.
- On the active nap screen only, add a subtle 4-second ease-in-out breathing loop from scale 1.0 to 1.012 and back.
- Keep the image anchored so the head and tail remain visually stable, and disable the loop for static mode and reduced-motion preferences.

## Verification

- Check the active nap flow and the other cat placements at iPhone and desktop sizes.
- Confirm the image is uncropped, transparent, shadow-free, and the app remains error-free.
