import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractFallbackMedia,
  extractPostSnapshot,
  extractStatusIdFromHref,
  findActionBar,
  findStatusAnchor,
  findSupportedPostArticles,
  isSupportedXLocation,
  normalizeHandle,
} from "../../src/content/dom";
import { normalizeImageUrl } from "../../src/bridge/media-extract";
import { buildMediaFilename } from "../../src/shared/download-utils";

function loadFixture(
  name: "x-home.html" | "x-detail.html" | "x-detail-nested.html" | "x-thread.html" | "x-video.html",
): string {
  return readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8");
}

describe("content dom helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.stubGlobal("location", { pathname: "/home", origin: "https://x.com" } as Location);
  });

  it("detects supported x locations", () => {
    expect(isSupportedXLocation("/")).toBe(true);
    expect(isSupportedXLocation("/home")).toBe(true);
    expect(isSupportedXLocation("/alice/status/1234567890123456789")).toBe(true);
    expect(isSupportedXLocation("/i/web/status/1234567890123456789")).toBe(true);
    expect(isSupportedXLocation("/explore")).toBe(false);
  });

  it("extracts status ids and normalizes handles", () => {
    expect(extractStatusIdFromHref("/alice/status/1234567890123456789")).toBe("1234567890123456789");
    expect(normalizeHandle("@ALICE")).toBe("alice");
  });

  it("normalizes image urls and builds filenames", () => {
    expect(normalizeImageUrl("https://pbs.twimg.com/media/Alpha?format=jpg&name=small")).toContain("name=orig");
    expect(
      buildMediaFilename({
        authorHandle: "alice",
        postId: "123",
        index: 1,
        kind: "photo",
        mimeType: "image/png",
        url: "https://pbs.twimg.com/media/Alpha?format=png&name=orig",
      }),
    ).toBe("@alice_123_01.png");
  });

  it("extracts supported posts and ignores nested quote media", () => {
    document.body.innerHTML = loadFixture("x-home.html");
    const articles = findSupportedPostArticles(document);
    expect(articles).toHaveLength(2);

    const snapshot = extractPostSnapshot(articles[0]);
    expect(snapshot?.statusId).toBe("1234567890123456789");
    expect(snapshot?.authorHandle).toBe("alice");
    expect(findActionBar(articles[0])).not.toBeNull();

    const media = extractFallbackMedia(articles[1], "9876543210987654321", "bob");
    expect(media).toHaveLength(0);
  });

  it("extracts fallback image media from detail views", () => {
    document.body.innerHTML = loadFixture("x-detail.html");
    const article = document.querySelector("article") as HTMLElement;
    const media = extractFallbackMedia(article, "2468135790246813579", "carol");
    expect(media).toHaveLength(1);
    expect(media[0]?.filename).toBe("@carol_2468135790246813579_01.jpg");
  });

  it("extracts embedded video media from the initial state payload", () => {
    document.body.innerHTML = loadFixture("x-video.html");

    const articles = findSupportedPostArticles(document);
    expect(articles).toHaveLength(1);

    const snapshot = extractPostSnapshot(articles[0]);
    expect(snapshot?.statusId).toBe("4444444444444444444");
    expect(snapshot?.authorHandle).toBe("dave");
    expect(snapshot?.fallbackItems).toHaveLength(1);
    expect(snapshot?.fallbackItems[0]?.kind).toBe("video");
    expect(snapshot?.fallbackItems[0]?.url).toContain("video.twimg.com");
    expect(snapshot?.fallbackItems[0]?.url).toContain("?tag=19");
    expect(snapshot?.fallbackItems[0]?.url).not.toContain("&#x3D;");
  });

  it("keeps the real detail post when it is nested inside a wrapper article with the same status", () => {
    document.body.innerHTML = loadFixture("x-detail-nested.html");

    const articles = findSupportedPostArticles(document);
    expect(articles).toHaveLength(1);

    const snapshot = extractPostSnapshot(articles[0]);
    expect(snapshot?.statusId).toBe("2468135790246813579");
    expect(snapshot?.fallbackItems).toHaveLength(1);
    expect(findActionBar(articles[0])?.getAttribute("aria-label")).toBe("Post actions");
  });

  it("ignores nested status anchors and nested action bars inside thread replies", () => {
    document.body.innerHTML = loadFixture("x-thread.html");
    const articles = findSupportedPostArticles(document);

    expect(articles).toHaveLength(3);

    const replyArticle = articles[1];
    expect(findStatusAnchor(replyArticle)?.getAttribute("href")).toBe("/bob/status/2222222222222222222");
    expect(findActionBar(replyArticle)?.getAttribute("aria-label")).toBe("Reply actions");

    const snapshot = extractPostSnapshot(replyArticle);
    expect(snapshot?.statusId).toBe("2222222222222222222");
    expect(snapshot?.authorHandle).toBe("bob");
    expect(snapshot?.fallbackItems).toHaveLength(0);
  });
});
