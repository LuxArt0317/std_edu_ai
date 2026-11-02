// UI navigation only. This flag is never an identity, token or data permission.
const key = "stu-affairs-preview-v1";
const ttl = 30 * 60 * 1000;
let memoryExpiry = 0;
export function hasAffairsPreview() {
  try {
    memoryExpiry = Number(sessionStorage.getItem(key)) || 0;
  } catch {
    /* In-memory preview still works when storage is blocked. */
  }
  return memoryExpiry > Date.now() && memoryExpiry <= Date.now() + ttl;
}
export function openAffairsPreview() {
  memoryExpiry = Date.now() + ttl;
  try {
    sessionStorage.setItem(key, String(memoryExpiry));
  } catch {
    /* Navigation only; never authentication. */
  }
}
export function closeAffairsPreview() {
  memoryExpiry = 0;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* In-memory state is also cleared. */
  }
}
