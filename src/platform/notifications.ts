// Wake-alert boundary. Web: foreground tone + optional vibration only.
// A future Capacitor build replaces this with scheduled local notifications.
import { playWakeTone } from "./audio";

export const wakeAlertReliability = "foreground-only" as const;

export function triggerWakeAlert() {
  playWakeTone();
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator)
      navigator.vibrate([200, 120, 200]);
  } catch {
    /* vibration unsupported (e.g. iOS Safari) */
  }
}

/** No-op on web: browsers cannot schedule exact local alarms. */
export function scheduleWakeAlert(_at: Date) {
  return false;
}

export function cancelWakeAlert() {
  /* no-op on web */
}
