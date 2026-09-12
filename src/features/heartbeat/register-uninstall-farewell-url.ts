import { uninstallFarewellBaseUrl } from "./constants/uninstall-farewell-url";
import { ensureInstallId } from "./ensure-install-id";
import { resolveHeartbeatExtVersion } from "./resolve-heartbeat-ext-version";

export async function registerUninstallFarewellUrl(): Promise<void> {
  try {
    if (!chrome.runtime?.setUninstallURL) return;
    const installId = await ensureInstallId();
    const url = new URL(uninstallFarewellBaseUrl);
    url.searchParams.set("id", installId);
    url.searchParams.set("v", resolveHeartbeatExtVersion());
    await chrome.runtime.setUninstallURL(url.toString());
  } catch {
    // Never block SW
  }
}
