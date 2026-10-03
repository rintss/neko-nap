// Durable key-value storage boundary. Web: localStorage. Future native builds can swap this module.
// Keys are unchanged from v0.1 — never rename without a tested migration.

export const STORAGE_KEYS = {
  session: "neko-nap-session-v1",
  records: "neko-nap-records-v1",
  still: "neko-nap-static-v1",
} as const;

function store(): Storage | null {
  try {
    return typeof window !== "undefined" && "localStorage" in window ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const value = store()?.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    store()?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota exceeded or storage blocked
  }
}

export function removeKey(key: string) {
  try {
    store()?.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
