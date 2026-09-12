import { registerUninstallFarewellUrl } from "./register-uninstall-farewell-url";
import { sendAnonymousHeartbeat } from "./send-anonymous-heartbeat";

export function registerHeartbeatOnInstalled(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    void registerUninstallFarewellUrl();
    if (details.reason === "install") {
      void sendAnonymousHeartbeat("install");
      return;
    }
    if (details.reason === "update") {
      void sendAnonymousHeartbeat("update");
    }
  });
}
