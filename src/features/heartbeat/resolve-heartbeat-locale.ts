export function resolveHeartbeatLocale(): string {
  try {
    return chrome.i18n?.getUILanguage?.() ?? "und";
  } catch {
    return "und";
  }
}
