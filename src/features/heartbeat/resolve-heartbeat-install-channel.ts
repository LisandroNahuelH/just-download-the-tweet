export type HeartbeatInstallChannel =
  | "unpacked"
  | "store"
  | "sideload"
  | "admin"
  | "unknown";

export async function resolveHeartbeatInstallChannel(): Promise<HeartbeatInstallChannel> {
  try {
    const selfInfo = await chrome.management?.getSelf?.();
    const type = selfInfo?.installType;
    if (type === "development") return "unpacked";
    if (type === "normal") return "store";
    if (type === "sideload") return "sideload";
    if (type === "admin") return "admin";
    return "unknown";
  } catch {
    return "unknown";
  }
}
