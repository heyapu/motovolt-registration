import type { SavedDraft } from "../types";

const DB_NAME = "motovolt-public-drafts-v1";
const STORE = "drafts";
const MAX_AGE = 24 * 60 * 60 * 1000;
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "browserId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Local storage unavailable"));
  });
}
export async function saveDraft(draft: SavedDraft): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("Could not save draft"));
      tx.onabort = () => reject(new Error("Could not save draft"));
    });
  } finally {
    db.close();
  }
}
export async function clearDraft(browserId: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(browserId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("Could not clear draft"));
    });
  } finally {
    db.close();
  }
}
export async function loadDraft(browserId: string): Promise<SavedDraft | null> {
  const db = await database();
  let value: SavedDraft | null;
  try {
    value = await new Promise<SavedDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(browserId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error("Could not load draft"));
    });
  } finally {
    db.close();
  }
  // Stored values are untrusted. The server revalidates every submission.
  if (!value) return null;
  if (
    value.browserId !== browserId ||
    typeof value.savedAt !== "number" ||
    Date.now() - value.savedAt > MAX_AGE ||
    !value.verification?.id ||
    typeof value.fields?.customerName !== "string"
  ) {
    await clearDraft(browserId);
    return null;
  }
  return value;
}
