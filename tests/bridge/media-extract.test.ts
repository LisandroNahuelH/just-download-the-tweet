import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildBundleFilename,
  buildMediaFilename,
  chooseBestVideoVariant,
  extractBundlesFromPayload,
  inferExtensionFromMimeType,
  normalizeImageUrl,
} from "../../src/bridge/media-extract";
import { buildZipBlob } from "../../src/shared/zip";

describe("bridge media extraction", () => {
  it("normalizes image URLs to original size", () => {
    expect(normalizeImageUrl("https://pbs.twimg.com/media/Alpha?format=jpg&name=small")).toBe(
      "https://pbs.twimg.com/media/Alpha?format=jpg&name=orig",
    );
  });

  it("selects the highest bitrate MP4 variant", () => {
    const best = chooseBestVideoVariant([
      { content_type: "application/x-mpegURL", url: "https://video.twimg.com/pl/test.m3u8" },
      { content_type: "video/mp4", bitrate: 320000, url: "https://video.twimg.com/320.mp4" },
      { content_type: "video/mp4", bitrate: 832000, url: "https://video.twimg.com/832.mp4" },
    ]);

    expect(best?.url).toBe("https://video.twimg.com/832.mp4");
  });

  it("extracts a video bundle from an embedded x initial state payload", () => {
    const bundles = extractBundlesFromPayload({
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              entries: [
                {
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: "4444444444444444444",
                          core: {
                            user_results: {
                              result: {
                                legacy: {
                                  screen_name: "dave",
                                },
                              },
                            },
                          },
                          legacy: {
                            id_str: "4444444444444444444",
                            extended_entities: {
                              media: [
                                {
                                  type: "video",
                                  media_url_https: "https://pbs.twimg.com/ext_tw_video_thumb/VideoThumb?format=jpg&name=small",
                                  video_info: {
                                    variants: [
                                      {
                                        content_type: "application/x-mpegURL",
                                        url: "https://video.twimg.com/ext_tw_video/4444444444444444444/pu/pl/playlist.m3u8",
                                      },
                                      {
                                        content_type: "video/mp4",
                                        bitrate: 256000,
                                        url: "https://video.twimg.com/ext_tw_video/4444444444444444444/pu/vid/avc1/320x180/low.mp4",
                                      },
                                      {
                                        content_type: "video/mp4",
                                        bitrate: 832000,
                                        url: "https://video.twimg.com/ext_tw_video/4444444444444444444/pu/vid/avc1/1280x720/high.mp4",
                                      },
                                    ],
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    });

    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.postId).toBe("4444444444444444444");
    expect(bundles[0]?.authorHandle).toBe("dave");
    expect(bundles[0]?.items).toHaveLength(1);
    expect(bundles[0]?.items[0]?.kind).toBe("video");
    expect(bundles[0]?.items[0]?.url).toBe(
      "https://video.twimg.com/ext_tw_video/4444444444444444444/pu/vid/avc1/1280x720/high.mp4",
    );
  });

  it("extracts bundles without including quoted tweet media", () => {
    const payload = {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              entries: [
                {
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: "1234567890",
                          core: {
                            user_results: {
                              result: {
                                legacy: {
                                  screen_name: "alpha",
                                },
                              },
                            },
                          },
                          legacy: {
                            id_str: "1234567890",
                            extended_entities: {
                              media: [
                                {
                                  type: "photo",
                                  media_url_https: "https://pbs.twimg.com/media/Alpha?format=jpg&name=small",
                                },
                              ],
                            },
                          },
                          quoted_status_result: {
                            result: {
                              rest_id: "999",
                              core: {
                                user_results: {
                                  result: {
                                    legacy: {
                                      screen_name: "quoted",
                                    },
                                  },
                                },
                              },
                              legacy: {
                                id_str: "999",
                                extended_entities: {
                                  media: [
                                    {
                                      type: "photo",
                                      media_url_https: "https://pbs.twimg.com/media/Quoted?format=png&name=small",
                                    },
                                  ],
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const bundles = extractBundlesFromPayload(payload);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.postId).toBe("1234567890");
    expect(bundles[0]?.items).toHaveLength(1);
    expect(bundles[0]?.items[0]?.url).toContain("Alpha");
  });

  it("builds deterministic filenames and zip archives", async () => {
    expect(
      buildMediaFilename({
        authorHandle: "alpha",
        postId: "1234567890",
        index: 1,
        kind: "photo",
        mimeType: "image/png",
        url: "https://pbs.twimg.com/media/Alpha?format=png&name=orig",
      }),
    ).toBe("@alpha_1234567890_01.png");

    expect(buildBundleFilename({ authorHandle: "alpha", postId: "1234567890" })).toBe(
      "@alpha_1234567890_media.zip",
    );
    expect(inferExtensionFromMimeType("video/mp4")).toBe("mp4");

    const zipBlob = await buildZipBlob([
      { filename: "one.txt", data: "alpha" },
      { filename: "two.txt", data: "beta" },
    ]);
    const zip = await JSZip.loadAsync(zipBlob as Blob);

    expect(await zip.file("one.txt")?.async("text")).toBe("alpha");
    expect(await zip.file("two.txt")?.async("text")).toBe("beta");
  });
});
