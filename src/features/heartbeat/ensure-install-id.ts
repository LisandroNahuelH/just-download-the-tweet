import {
  heartbeatInstallIdKey
} from "./constants/heartbeat-storage-keys";

export async function ensureInstallId(): Promise<string> {
  const current = await chrome.storage.local.get(heartbeatInstallIdKey);
  const existing = current[heartbeatInstallIdKey];
  if (typeof existing === "string" && existing.length >= 32) {
    return existing;
  }
  const installId = crypto.randomUUID();
  await chrome.storage.local.set({ [heartbeatInstallIdKey]: installId });
  return installId;
}
