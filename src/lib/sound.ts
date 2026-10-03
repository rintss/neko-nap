// Shared nap sound engine. One AudioContext, one master gain so the volume slider
// works on iPhone (iOS ignores HTMLAudioElement.volume).

type Nav = Navigator & { audioSession?: { type: string } };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let purrBuffer: AudioBuffer | null = null;
let current: { stop: () => void } | null = null;
let previewTimer: number | undefined;

function ensureContext() {
  if (!ctx) {
    if (typeof window === "undefined" || !(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)) return null;
    const nav = navigator as Nav;
    // iOS 17+: play even when the ring/silent switch is on.
    if (nav.audioSession) nav.audioSession.type = "playback";
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
  return { ctx, master: master! };
}

function curve(volume: number) {
  const v = Math.max(0, Math.min(100, volume)) / 100;
  return v * v * 1.4;
}

function buildPurr(context: AudioContext) {
  if (purrBuffer) return purrBuffer;
  const rate = context.sampleRate;
  const seconds = 4;
  const length = rate * seconds;
  const buffer = context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let low = 0;
  let band = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const white = Math.random() * 2 - 1;
    low += 0.08 * (white - low); // soft rumble noise
    band += 0.35 * (white - band);
    const phase = (t % seconds) / seconds;
    // inhale (quieter) then exhale (fuller), seamless at loop edges
    const breath = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * phase), 2) * (phase > 0.4 ? 1 : 0.55);
    const rate26 = 24 + 3 * Math.sin(2 * Math.PI * phase);
    const pulse = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * rate26 * t), 3);
    const tone = Math.sin(2 * Math.PI * 110 * t) * 0.25 + Math.sin(2 * Math.PI * 165 * t) * 0.12;
    data[i] = (low * 2.2 + (band - low) * 0.35 + tone) * pulse * breath * 0.9;
  }
  purrBuffer = buffer;
  return buffer;
}

export function setVolume(volume: number) {
  if (master && ctx) master.gain.setTargetAtTime(curve(volume), ctx.currentTime, 0.05);
}

export function stopSound() {
  window.clearTimeout(previewTimer);
  current?.stop();
  current = null;
}

export function playPurr(volume: number) {
  stopSound();
  const audioCtx = ensureContext();
  if (!audioCtx) return;
  const { ctx: c, master: m } = audioCtx;
  m.gain.value = curve(volume);
  const src = c.createBufferSource();
  src.buffer = buildPurr(c);
  src.loop = true;
  src.connect(m);
  src.start();
  current = { stop: () => { try { src.stop(); } catch { /* already stopped */ } src.disconnect(); } };
}

const elementSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

export function playElement(audio: HTMLAudioElement, volume: number, fromStart = true) {
  stopSound();
  const audioCtx = ensureContext();
  audio.loop = true;
  if (!audioCtx) {
    if (fromStart) audio.currentTime = 0;
    void audio.play().catch(() => undefined);
    current = { stop: () => audio.pause() };
    return;
  }
  const { ctx: c, master: m } = audioCtx;
  m.gain.value = curve(volume);
  let node = elementSources.get(audio);
  if (!node) {
    node = c.createMediaElementSource(audio);
    node.connect(m);
    elementSources.set(audio, node);
  }
  audio.loop = true;
  if (fromStart) audio.currentTime = 0;
  void audio.play().catch(() => undefined);
  current = { stop: () => audio.pause() };
}

export function preview(kind: "purr" | "local", volume: number, audio?: HTMLAudioElement | null) {
  if (kind === "purr") playPurr(volume);
  else if (audio) playElement(audio, volume);
  else return;
  previewTimer = window.setTimeout(stopSound, 4000);
}

export function playWakeTone() {
  const audioCtx = ensureContext();
  if (!audioCtx) return;
  const { ctx: c } = audioCtx;
  [0, 0.28, 0.56].forEach((delay, index) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = index === 1 ? 660 : 520;
    const t = c.currentTime + delay;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  });
}
