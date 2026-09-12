import { heartbeatApiKey } from "./constants/heartbeat-api-key";
import { heartbeatEndpoint } from "./constants/heartbeat-endpoint";
import { heartbeatProductSlug } from "./constants/heartbeat-product-slug";
import { heartbeatLastAtKey } from "./constants/heartbeat-storage-keys";
import { heartbeatThrottleMs } from "./constants/heartbeat-throttle-ms";
import { ensureInstallId } from "./ensure-install-id";
import { resolveHeartbeatExtVersion } from "./resolve-heartbeat-ext-version";
import { resolveHeartbeatInstallChannel } from "./resolve-heartbeat-install-channel";
import { resolveHeartbeatLocale } from "./resolve-heartbeat-locale";
import { resolveHeartbeatTimezone } from "./resolve-heartbeat-timezone";

export type HeartbeatEvent = "install" | "update" | "ping";

export async function sendAnonymousHeartbeat(event: HeartbeatEvent): Promise<void> {
  try {
    const now = Date.now();
    if (event === "ping") {
      const stored = await chrome.storage.local.get(heartbeatLastAtKey);
      const last = stored[heartbeatLastAtKey];
      if (typeof last === "number" && now - last < heartbeatThrottleMs) {
        return;
      }
    }

    const body = {
      v: 1,
      product: heartbeatProductSlug,
      event,
      extVersion: resolveHeartbeatExtVersion(),
      installId: await ensureInstallId(),
      installChannel: await resolveHeartbeatInstallChannel(),
      locale: resolveHeartbeatLocale(),
      timezone: resolveHeartbeatTimezone(),
      ts: now
    };

    const response = await fetch(heartbeatEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Heartbeat-Key": heartbeatApiKey
      },
      body: JSON.stringify(body),
      keepalive: true
    });

    if (!response.ok) return;

    let throttled = false;
    try {
      const data = (await response.json()) as { throttled?: boolean };
      throttled = data.throttled === true;
    } catch {
      // ignore
    }
    if (throttled) return;
    if (event === "ping") {
      await chrome.storage.local.set({ [heartbeatLastAtKey]: now });
    }
  } catch {
    // Fire-and-forget
  }
}
