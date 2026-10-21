const DATABASE_NAME = "neko-nap-media-v1";
const STORE_NAME = "media";
const AUDIO_KEY = "custom-audio";

type StoredAudio = {
  key: typeof AUDIO_KEY;
  blob: Blob;
  name: string;
  type: string;
  updatedAt: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open local media storage"));
  });
}

export async function saveLocalAudio(file: File) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(
        {
          key: AUDIO_KEY,
          blob: file,
          name: file.name,
          type: file.type,
          updatedAt: new Date().toISOString(),
        } satisfies StoredAudio,
        AUDIO_KEY,
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save audio"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Audio save was aborted"));
    });
    return true;
  } finally {
    database.close();
  }
}

export async function loadLocalAudio() {
  const database = await openDatabase();
  try {
    const value = await new Promise<StoredAudio | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(AUDIO_KEY);
      request.onsuccess = () => resolve(request.result as StoredAudio | undefined);
      request.onerror = () => reject(request.error ?? new Error("Could not load audio"));
    });
    if (!value?.blob) return null;
    return new File([value.blob], value.name || "custom-audio", {
      type: value.type || value.blob.type,
      lastModified: value.updatedAt ? new Date(value.updatedAt).getTime() : Date.now(),
    });
  } finally {
    database.close();
  }
}
