export function resolveHeartbeatExtVersion(): string {
  try {
    return chrome.runtime.getManifest()?.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
