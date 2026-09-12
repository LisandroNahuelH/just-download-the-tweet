import { bootstrapJustDownloadTheTweet, JustDownloadTheTweetApp } from "./ui";

export { bootstrapJustDownloadTheTweet, JustDownloadTheTweetApp } from "./ui";
export * from "./dom";

bootstrapJustDownloadTheTweet();

try {
  chrome.runtime.sendMessage({ type: "HEARTBEAT_PING" }, () => {
    void chrome.runtime.lastError;
  });
} catch {
  /* ignore */
}
