import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BRIDGE_MEDIA_EVENT } from "../../src/bridge/contracts";
import { bootstrapJustDownloadTheTweet, JustDownloadTheTweetApp } from "../../src/content/ui";

function loadFixture(
  name: "x-home.html" | "x-detail.html" | "x-detail-nested.html" | "x-thread.html" | "x-video.html",
): string {
  return readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8");
}

describe("just download the tweet ui", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.stubGlobal("location", { pathname: "/home", origin: "https://x.com" } as Location);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn((message: any, callback: (response?: unknown) => void) => {
          if (message.type === "DOWNLOAD_ZIP") {
            callback({
              type: "DOWNLOAD_RESULT",
              requestId: message.requestId,
              action: "DOWNLOAD_ZIP",
              ok: true,
              files: [
                {
                  ok: true,
                  filename: "@alice_1234567890123456789_media.zip",
                  url: "blob:zip",
                  downloadId: 1,
                },
              ],
              archiveFilename: "@alice_1234567890123456789_media.zip",
              archiveUrl: "blob:zip",
            });
            return;
          }

          if (message.type === "DOWNLOAD_ONE") {
            callback({
              type: "DOWNLOAD_RESULT",
              requestId: message.requestId,
              action: "DOWNLOAD_ONE",
              ok: true,
              files: [
                {
                  ok: true,
                  filename: message.filename ?? message.item?.filename ?? "@alice_1234567890123456789_01.jpg",
                  url: message.item.url,
                  downloadId: 1,
                },
              ],
            });
            return;
          }

          if (message.type === "DOWNLOAD_ALL") {
            callback({
              type: "DOWNLOAD_RESULT",
              requestId: message.requestId,
              action: "DOWNLOAD_ALL",
              ok: true,
              files: message.bundle.items.map((item: any, index: number) => ({
                ok: true,
                filename: item.filename ?? `item-${index + 1}.jpg`,
                url: item.url,
                downloadId: index + 1,
              })),
            });
            return;
          }

          callback(undefined);
        }),
      },
    } as any);
  });

  it("mounts one control per post and keeps scans idempotent", () => {
    document.body.innerHTML = loadFixture("x-home.html");

    const app = new JustDownloadTheTweetApp();
    app.scanNow();
    app.scanNow();

    const hosts = document.querySelectorAll("[data-just-download-the-tweet-host]");
    expect(hosts).toHaveLength(1);
  });

  it("mounts controls when X is served from the root path", () => {
    vi.stubGlobal("location", { pathname: "/", origin: "https://x.com" } as Location);
    document.body.innerHTML = loadFixture("x-home.html");

    const app = new JustDownloadTheTweetApp();
    app.scanNow();

    const hosts = document.querySelectorAll("[data-just-download-the-tweet-host]");
    expect(hosts).toHaveLength(1);
  });

  it("opens a popover for multi-media posts and sends download commands", async () => {
    document.body.innerHTML = loadFixture("x-home.html");

    const app = new JustDownloadTheTweetApp();
    app.scanNow();

    const host = document.querySelector("[data-just-download-the-tweet-host]") as HTMLDivElement;
    expect(host).not.toBeNull();

    const trigger = host.shadowRoot?.querySelector("button") as HTMLButtonElement;
    expect(trigger.getAttribute("aria-label")).toContain("Post download options");

    trigger.click();
    await Promise.resolve();

    const popover = host.shadowRoot?.querySelector('[role="menu"]') as HTMLDivElement;
    expect(popover.dataset.open).toBe("true");
    expect(popover.style.left).toMatch(/px$/);
    expect(popover.style.top).toMatch(/px$/);
    expect(popover.textContent).toContain("Media 1");
    expect(popover.textContent).toContain("Media 2");
    expect(popover.textContent).toContain("Download ZIP");

    const zipButton = Array.from(host.shadowRoot?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("Download ZIP"),
    ) as HTMLButtonElement;

    zipButton.click();
    await Promise.resolve();

    const sendMessageMock = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>;
    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({ type: "DOWNLOAD_ZIP" }), expect.any(Function));
  });

  it("downloads a selected item from the multi-media popover", async () => {
    document.body.innerHTML = loadFixture("x-home.html");

    const app = new JustDownloadTheTweetApp();
    app.scanNow();

    const host = document.querySelector("[data-just-download-the-tweet-host]") as HTMLDivElement;
    const trigger = host.shadowRoot?.querySelector("button") as HTMLButtonElement;

    trigger.click();
    await Promise.resolve();

    const mediaTwoButton = Array.from(host.shadowRoot?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("Media 2"),
    ) as HTMLButtonElement;

    expect(mediaTwoButton).not.toBeNull();
    mediaTwoButton.click();
    await Promise.resolve();

    const sendMessageMock = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>;
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "DOWNLOAD_ONE",
        item: expect.objectContaining({
          index: 2,
          url: expect.stringContaining("Bravo"),
        }),
      }),
      expect.any(Function),
    );
  });

  it("downloads a single item directly on detail views", async () => {
    vi.stubGlobal("location", { pathname: "/carol/status/2468135790246813579", origin: "https://x.com" } as Location);
    document.body.innerHTML = loadFixture("x-detail.html");

    const app = new JustDownloadTheTweetApp();
    app.scanNow();

    const host = document.querySelector("[data-just-download-the-tweet-host]") as HTMLDivElement;
    const trigger = host.shadowRoot?.querySelector("button") as HTMLButtonElement;
    trigger.click();
    await Promise.resolve();

    const sendMessageMock = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>;
    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({ type: "DOWNLOAD_ONE" }), expect.any(Function));
  });

  it("mounts the control on embedded video posts without bridge data", async () => {
    document.body.innerHTML = loadFixture("x-video.html");

    const app = new JustDownloadTheTweetApp();
    app.scanNow();

    const host = document.querySelector("[data-just-download-the-tweet-host]") as HTMLDivElement;
    expect(host).not.toBeNull();

    const trigger = host.shadowRoot?.querySelector("button") as HTMLButtonElement;
    expect(trigger).not.toBeNull();

    trigger.click();
    await Promise.resolve();

    const sendMessageMock = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>;
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "DOWNLOAD_ONE",
        item: expect.objectContaining({ kind: "video" }),
      }),
      expect.any(Function),
    );
  });

  it("mounts the control on the real detail post even if it is nested under a wrapper article", () => {
    vi.stubGlobal("location", { pathname: "/carol/status/2468135790246813579", origin: "https://x.com" } as Location);
    document.body.innerHTML = loadFixture("x-detail-nested.html");

    const app = new JustDownloadTheTweetApp();
    app.scanNow();

    const hosts = document.querySelectorAll("[data-just-download-the-tweet-host]");
    expect(hosts).toHaveLength(1);

    const postActions = Array.from(document.querySelectorAll<HTMLElement>('[role="group"]')).find(
      (group) => group.getAttribute("aria-label") === "Post actions",
    );
    expect(postActions?.querySelector("[data-just-download-the-tweet-host]")).not.toBeNull();
  });

  it("boots without throwing", () => {
    document.body.innerHTML = loadFixture("x-detail.html");
    expect(() => bootstrapJustDownloadTheTweet()).not.toThrow();
  });

  it("shows the button only on the thread post that has its own media", () => {
    vi.stubGlobal("location", { pathname: "/alice/status/1111111111111111111", origin: "https://x.com" } as Location);
    document.body.innerHTML = loadFixture("x-thread.html");

    const app = new JustDownloadTheTweetApp();
    app.scanNow();

    const articles = getTopLevelTweetArticles();
    expect(articles[0]?.querySelector("[data-just-download-the-tweet-host]")).not.toBeNull();
    expect(articles[1]?.querySelector("[data-just-download-the-tweet-host]")).toBeNull();
    expect(articles[2]?.querySelector("[data-just-download-the-tweet-host]")).toBeNull();
  });

  it("mounts a host later only for the reply that receives bridge media", async () => {
    vi.stubGlobal("location", { pathname: "/alice/status/1111111111111111111", origin: "https://x.com" } as Location);
    document.body.innerHTML = loadFixture("x-thread.html");

    const app = new JustDownloadTheTweetApp();
    app.start();
    await Promise.resolve();

    const articles = getTopLevelTweetArticles();
    expect(articles[0]?.querySelector("[data-just-download-the-tweet-host]")).not.toBeNull();
    expect(articles[1]?.querySelector("[data-just-download-the-tweet-host]")).toBeNull();
    expect(articles[2]?.querySelector("[data-just-download-the-tweet-host]")).toBeNull();

    document.dispatchEvent(
      new CustomEvent(BRIDGE_MEDIA_EVENT, {
        detail: {
          bundle: {
            postId: "2222222222222222222",
            authorHandle: "bob",
            permalink: "https://x.com/bob/status/2222222222222222222",
            items: [
              {
                postId: "2222222222222222222",
                authorHandle: "bob",
                index: 1,
                kind: "video",
                url: "https://video.twimg.com/ext_tw_video/bridge.mp4",
                mimeType: "video/mp4",
                filename: "@bob_2222222222222222222_01.mp4",
              },
            ],
          },
          transport: "fetch",
          capturedAt: Date.now(),
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(articles[0]?.querySelector("[data-just-download-the-tweet-host]")).not.toBeNull();
    expect(articles[1]?.querySelector("[data-just-download-the-tweet-host]")).not.toBeNull();
    expect(articles[2]?.querySelector("[data-just-download-the-tweet-host]")).toBeNull();
  });
});

function getTopLevelTweetArticles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("article[data-testid='tweet']")).filter((article) => {
    return !article.parentElement?.closest("article");
  });
}
