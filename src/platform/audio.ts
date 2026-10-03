// Audio boundary. Web implementation lives in lib/sound; native builds can replace this module.
export { playElement, playWakeTone, preview, setVolume, stopSound } from "@/lib/sound";

export function isAudioSupported() {
  return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
}
