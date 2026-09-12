export function resolveHeartbeatTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === "string" && tz.length > 0 && tz.length <= 64) {
      return tz;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}
